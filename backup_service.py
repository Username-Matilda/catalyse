"""
Automated Database Backup for Catalyse
Backs up the SQLite database to Backblaze B2 and keeps local copies.

Setup:
1. Create a Backblaze B2 account and bucket (EU region recommended)
2. Create an application key with read/write access to the bucket
3. Set environment variables in Railway:
   - B2_KEY_ID: your Backblaze keyID
   - B2_APP_KEY: your Backblaze applicationKey
   - B2_BUCKET_NAME: your bucket name (e.g. 'Catalyse')
"""

import os
import json
import shutil
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError


# Configuration
B2_KEY_ID = os.environ.get("B2_KEY_ID")
B2_APP_KEY = os.environ.get("B2_APP_KEY")
B2_BUCKET_NAME = os.environ.get("B2_BUCKET_NAME")

# Database location (same logic as api.py)
_data_dir = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH", str(Path(__file__).parent))
DATABASE_PATH = Path(_data_dir) / "catalyse.db"
LOCAL_BACKUP_DIR = Path(_data_dir) / "backups"

# Retention
LOCAL_RETENTION_DAYS = 7
B2_RETENTION_DAYS = 30


def is_b2_configured() -> bool:
    """Check if Backblaze B2 credentials are set."""
    return bool(B2_KEY_ID and B2_APP_KEY and B2_BUCKET_NAME)


def b2_authorize():
    """Authorize with Backblaze B2 API. Returns auth token and API URL."""
    import base64
    credentials = base64.b64encode(f"{B2_KEY_ID}:{B2_APP_KEY}".encode()).decode()

    request = Request(
        "https://api.backblazeb2.com/b2api/v2/b2_authorize_account",
        headers={"Authorization": f"Basic {credentials}"}
    )

    with urlopen(request, timeout=15) as response:
        data = json.loads(response.read())
        return {
            "auth_token": data["authorizationToken"],
            "api_url": data["apiUrl"],
            "download_url": data["downloadUrl"],
            "account_id": data["accountId"]
        }


def b2_get_upload_url(auth, bucket_id):
    """Get an upload URL for the bucket."""
    request = Request(
        f"{auth['api_url']}/b2api/v2/b2_get_upload_url",
        data=json.dumps({"bucketId": bucket_id}).encode(),
        headers={
            "Authorization": auth["auth_token"],
            "Content-Type": "application/json"
        }
    )

    with urlopen(request, timeout=15) as response:
        data = json.loads(response.read())
        return data["uploadUrl"], data["authorizationToken"]


def b2_get_bucket_id(auth, bucket_name):
    """Get bucket ID by name."""
    request = Request(
        f"{auth['api_url']}/b2api/v2/b2_list_buckets",
        data=json.dumps({
            "accountId": auth["account_id"],
            "bucketName": bucket_name
        }).encode(),
        headers={
            "Authorization": auth["auth_token"],
            "Content-Type": "application/json"
        }
    )

    with urlopen(request, timeout=15) as response:
        data = json.loads(response.read())
        buckets = data.get("buckets", [])
        if not buckets:
            raise ValueError(f"Bucket '{bucket_name}' not found")
        return buckets[0]["bucketId"]


def b2_upload_file(upload_url, upload_token, file_path, file_name):
    """Upload a file to B2."""
    with open(file_path, "rb") as f:
        file_data = f.read()

    sha1_hash = hashlib.sha1(file_data).hexdigest()

    request = Request(
        upload_url,
        data=file_data,
        headers={
            "Authorization": upload_token,
            "X-Bz-File-Name": file_name,
            "Content-Type": "application/octet-stream",
            "Content-Length": str(len(file_data)),
            "X-Bz-Content-Sha1": sha1_hash
        },
        method="POST"
    )

    with urlopen(request, timeout=60) as response:
        return json.loads(response.read())


def b2_list_files(auth, bucket_id, prefix=""):
    """List files in a bucket."""
    request = Request(
        f"{auth['api_url']}/b2api/v2/b2_list_file_names",
        data=json.dumps({
            "bucketId": bucket_id,
            "prefix": prefix,
            "maxFileCount": 1000
        }).encode(),
        headers={
            "Authorization": auth["auth_token"],
            "Content-Type": "application/json"
        }
    )

    with urlopen(request, timeout=15) as response:
        data = json.loads(response.read())
        return data.get("files", [])


def b2_delete_file(auth, file_id, file_name):
    """Delete a file from B2."""
    request = Request(
        f"{auth['api_url']}/b2api/v2/b2_delete_file_version",
        data=json.dumps({
            "fileId": file_id,
            "fileName": file_name
        }).encode(),
        headers={
            "Authorization": auth["auth_token"],
            "Content-Type": "application/json"
        }
    )

    with urlopen(request, timeout=15) as response:
        return json.loads(response.read())


def create_local_backup():
    """Create a local backup of the database. Returns the backup path."""
    if not DATABASE_PATH.exists():
        print("[BACKUP] No database found, skipping")
        return None

    LOCAL_BACKUP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    backup_name = f"catalyse-{timestamp}.db"
    backup_path = LOCAL_BACKUP_DIR / backup_name

    # Use shutil.copy2 to preserve metadata
    shutil.copy2(DATABASE_PATH, backup_path)
    size_kb = backup_path.stat().st_size / 1024
    print(f"[BACKUP] Local backup created: {backup_name} ({size_kb:.0f} KB)")
    return backup_path


def cleanup_local_backups():
    """Remove local backups older than retention period."""
    if not LOCAL_BACKUP_DIR.exists():
        return

    cutoff = datetime.now() - timedelta(days=LOCAL_RETENTION_DAYS)
    removed = 0
    for f in LOCAL_BACKUP_DIR.glob("catalyse-*.db"):
        if datetime.fromtimestamp(f.stat().st_mtime) < cutoff:
            f.unlink()
            removed += 1

    if removed:
        print(f"[BACKUP] Cleaned up {removed} local backup(s) older than {LOCAL_RETENTION_DAYS} days")


def upload_to_b2(backup_path):
    """Upload a backup file to Backblaze B2."""
    if not is_b2_configured():
        print("[BACKUP] B2 not configured, skipping cloud upload")
        return False

    try:
        auth = b2_authorize()
        bucket_id = b2_get_bucket_id(auth, B2_BUCKET_NAME)
        upload_url, upload_token = b2_get_upload_url(auth, bucket_id)

        file_name = f"backups/{backup_path.name}"
        result = b2_upload_file(upload_url, upload_token, backup_path, file_name)

        size_kb = result.get("contentLength", 0) / 1024
        print(f"[BACKUP] Uploaded to B2: {file_name} ({size_kb:.0f} KB)")
        return True

    except Exception as e:
        print(f"[BACKUP ERROR] B2 upload failed: {e}")
        return False


def cleanup_b2_backups():
    """Remove B2 backups older than retention period."""
    if not is_b2_configured():
        return

    try:
        auth = b2_authorize()
        bucket_id = b2_get_bucket_id(auth, B2_BUCKET_NAME)
        files = b2_list_files(auth, bucket_id, prefix="backups/")

        cutoff_ms = int((datetime.now() - timedelta(days=B2_RETENTION_DAYS)).timestamp() * 1000)
        removed = 0

        for f in files:
            if f.get("uploadTimestamp", 0) < cutoff_ms:
                b2_delete_file(auth, f["fileId"], f["fileName"])
                removed += 1

        if removed:
            print(f"[BACKUP] Cleaned up {removed} B2 backup(s) older than {B2_RETENTION_DAYS} days")

    except Exception as e:
        print(f"[BACKUP ERROR] B2 cleanup failed: {e}")


def run_backup():
    """Run a full backup cycle: local + B2 + cleanup."""
    print(f"[BACKUP] Starting backup at {datetime.now().isoformat()}")

    # Create local backup
    backup_path = create_local_backup()
    if not backup_path:
        return

    # Upload to B2
    upload_to_b2(backup_path)

    # Cleanup old backups
    cleanup_local_backups()
    cleanup_b2_backups()

    print(f"[BACKUP] Backup cycle complete")


if __name__ == "__main__":
    run_backup()
