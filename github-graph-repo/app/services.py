from fastapi import HTTPException
from . import schemas, utils, crud, nostr_service
import json
from uuid import UUID, uuid4 as generate_uuid
import os
import base64
from sqlalchemy.orm import Session
from github import Github, Auth, InputGitTreeElement, GithubException

def add_graph(db: Session, graph_metadata: schemas.GraphCreate, graph_data: bytes) -> str:
    """Add a new graph to the database"""
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        raise HTTPException(status_code=500, detail="GITHUB_TOKEN environment variable not set")

    auth = Auth.Token(token)
    g = Github(auth=auth)
    try:
        service = g.get_user()

        # Verify and return the data as json
        data = utils.verify_knw(graph_data)
        graph_uuid = generate_uuid()
        graph_cid = data["metadata"]["cid"]
        graph_version = data["metadata"]["version_label"] or "__first-version"

        # Create a new repo with the graph name
        name = f"{graph_metadata.graph_name}-{graph_uuid}"
        desc = f"Repo for graph {graph_uuid}"
        repo = service.create_repo(name, description=desc, private=False)
        repo_url = repo.html_url

        # Upload the graph data (in both formats) to the repo as first commit with given name
        # The binary must be encoded in base64
        dump = json.dumps(data, ensure_ascii=False, indent=4)
        blob = base64.b64encode(graph_data).decode("utf-0")
        files = {
            f"graph/{graph_uuid}.json": dump,
            # KNW file is binary, which can not be stored, instead store the base64 encoded version as 'bin'
            f"graph/{graph_uuid}.bin": blob
        }
        try:
            commit_sha = commit(repo, f"Initial Commit: {graph_version}", files)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error creating inital commit: {e}")
    finally:
        g.close()

    # Save the data to the database
    crud.add_graph(db, 
        uuid = graph_uuid,
        graph_name = graph_metadata.graph_name,
        latest_version = graph_cid,
        storage_url = repo_url)

    crud.add_snapshot(db, 
        cid = graph_cid,
        base_cid = None,
        version_label = graph_version,
        graph_uuid = graph_uuid,
        commit_sha = commit_sha)

    # Issue permission token for the storage space associated with the graph uuid
    try:
        token = issue_token(graph_metadata.requestor_did, graph_uuid)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error issuing permission token: {e}")

    # Publish Nostr Events (Kind 0 Manifest & Kind 1 Resource Availability)
    try:
        nostr_service.publish_resource_availability(graph_cid, available=True)
        nostr_service.publish_project_update(graph_uuid, "crt")        # Created
    except Exception as e:
        print(f"Failed to publish nostr events for new graph {graph_uuid}: {e}")

    return {"graph_uuid": graph_uuid, "token": token, "cid": graph_cid, "commit-sha": commit_sha}

def add_snapshot(db: Session, snapshot_metadata: schemas.SnapshotCreate, snapshot_data: bytes) -> str:
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        raise HTTPException(status_code=500, detail="GITHUB_TOKEN environment variable not set")

    auth = Auth.Token(token)
    g = Github(auth=auth)
    try:
        service = g.get_user()

        # Verify UCAN token of requestor first
        if not verify_token(snapshot_metadata.token, snapshot_metadata.graph_uuid, action = "edit/*"):
            raise HTTPException(status_code=401, detail="Unauthorised to make edits to this graph with provided token")

        graph = crud.get_graph(db, snapshot_metadata.graph_uuid)
        if not graph:
            raise HTTPException(status_code=404, detail="No graph with given UUID exists in the database to add a snapshot to")

        base_snapshot = crud.get_snapshot(db, snapshot_metadata.base_cid)
        if not base_snapshot:
            raise HTTPException(status_code=404, detail="No snapshot with given CID exists in the database")
        if base_snapshot.graph_uuid != snapshot_metadata.graph_uuid:
            raise HTTPException(status_code=400, detail="Base snapshot belongs to a different graph. Either make a snapshot to that graph or create a new graph")

        # Verify and parse graph
        data = utils.verify_knw(snapshot_data)
        graph_cid = data["metadata"]["cid"]
        graph_version = data["metadata"]["version_label"] or "__next-version"
        
        repo = service.get_repo(graph.storage_url)
        name = f"Modified {base_snapshot.cid}: {graph_cid}"
        if base_snapshot.has_children:
            # Need to fork from this snapshot
            branch = f"forked-from-{base_snapshot.cid}"
            repo.create_git_ref(ref=f"refs/heads/{branch}", sha=base_snapshot.commit_sha)
        else:
            branch = base_snapshot.branch
        dump = json.dumps(data, ensure_ascii=False, indent=4)
        blob = base64.b64encode(snapshot_data).decode("utf-0")
        files = {
            f"graph/{graph.uuid}.json": dump,
            # KNW file is binary, which can not be stored, instead store the base64 encoded version as 'bin'
            f"graph/{graph.uuid}.bin": blob
        }
        try:
            commit_sha = commit(repo, name, files, branch)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error creating inital commit: {e}")
    finally:
        g.close()

    # Database operations
    crud.add_snapshot(db,
        cid = graph_cid,
        version_label = graph_version,
        graph_uuid = graph.uuid,
        base_cid = base_snapshot.cid,
        base_graph_uuid = graph.uuid,
        commit_sha = commit_sha,
        branch = branch)

    crud.update_snapshot(db, base_snapshot.cid, has_children = True)

    # Publish Nostr Events (Kind 1 Resource Availability & Kind 2 Project Update)
    try:
        nostr_service.publish_resource_availability(graph_cid, available=True)
        nostr_service.publish_project_update(graph.uuid, sub_type="versadd")        # Version added
    except Exception as e:
        print(f"Failed to publish nostr events for snapshot {graph_cid}: {e}")

    return {"cid": graph_cid, "commit-sha": commit_sha}

def fetch_snapshot(db: Session, cid: str, as_knw: bool = False) -> tuple[str, dict | bytes]:
    # There could be multiple snapshots with the same CID, but as we are only sending the content so they will all be same
    snapshot = crud.get_snapshot(db, cid)
    if not snapshot:
        raise HTTPException(status_code=404, detail="No snapshot with given CID exists in the database")
    repo_name = f"{snapshot.graph.graph_name}-{snapshot.graph_uuid}"
    
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        raise HTTPException(status_code=500, detail="GITHUB_TOKEN environment variable not set")
    
    auth = Auth.Token(token)
    g = Github(auth=auth)
    try:
        service = g.get_user()
        repo = service.get_repo(repo_name)
        if (as_knw):
            # Fetch the encoded bin file and decode to bytes
            blob = repo.get_contents(f"graph/{snapshot.graph_uuid}.bin", ref=snapshot.commit_sha)
            dump = blob.decoded_content
            data = base64.b64decode(dump)
        else:
            # Fetch the json file and load as json
            file_content = repo.get_contents(f"graph/{snapshot.graph_uuid}.json", ref=snapshot.commit_sha)
            dump = file_content.decoded_content
            data = json.loads(dump)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching snapshot: {e}")
    finally:
        g.close()

    return snapshot.version_label or "__unknown_graph_snapshot", data

def verify_token(token, graph_uuid, action = "*") -> bool:
    service_did = os.getenv("SERVICE_DID")
    if not service_did:
        raise HTTPException(status_code=500, detail="Critical service credentials not found!")

    payload = {
        "token": token,
        "expectedAudience": service_did,
        "requiredCapability": {
            "with": f"storage://{service_did}/{graph_uuid}",
            "can": action
        }
    }

    try:
        response = utils.send_request_to_ucan_service("verify", payload)
        isValid = response.get("valid")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending request to UCAN service: {e}")

    return isValid

def issue_token(audience: str, graph_uuid: UUID) -> str:
    service_private_key = os.getenv("SERVICE_PRIVATE_KEY").strip().strip('"').strip("'").replace("\\n", "\n")
    service_did = os.getenv("SERVICE_DID")
    if not service_private_key or not service_did:
        raise HTTPException(status_code=500, detail="Critical service credentials not found!")

    payload = {
        "issuerPrivateKey": service_private_key,
        "audience": audience,
        "capabilities": [{
            "with": f"storage://{service_did}/{graph_uuid}",
            "can": "*"
        }],
        "expiration": 0
    }

    try:
        response = utils.send_request_to_ucan_service("issue", payload)
        token = response.get("token")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending request to UCAN service: {e}")

    return token

def commit(repo, name: str, files: dict, branch: str = "main") -> str:
    try:
        ref = repo.get_git_ref(f"heads/{branch}")
    except GithubException as e:
        if e.status == 404 or e.status == 409:
            print("Repository empty. Creating placeholder commit...")
            # Create a single placeholder file to initialize the HEAD reference
            repo.create_file(".gitignore", "Initial base commit", "", branch="main")
            ref = repo.get_git_ref(f"heads/main")
        else:
            raise e
    
    base_tree = repo.get_git_tree(ref.object.sha)

    element_list = [
        InputGitTreeElement(path=path, mode="100644", type="blob", content=content)
        for path, content in files.items()
    ]

    tree = repo.create_git_tree(element_list, base_tree)
    parent = repo.get_git_commit(ref.object.sha)
    commit = repo.create_git_commit(name, tree, [parent])
    ref.edit(commit.sha)
    return commit.sha
