import os
import firebase_admin
from firebase_admin import credentials, firestore, storage

# Initialize Firebase Admin SDK
firebase_app = None
# Look for credentials path in environment variables
cred_path = os.getenv("FIREBASE_CREDENTIALS")
db = None
bucket = None

if os.getenv("TESTING") == "True":
    from unittest.mock import MagicMock
    db = MagicMock()
    bucket = MagicMock()
else:
    project_id = os.getenv("FIREBASE_PROJECT_ID", "multimodel-rag-project")
    bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET", f"{project_id}.appspot.com")
    
    if not firebase_admin._apps:
        import json
        cred_json_str = os.getenv("FIREBASE_CREDENTIALS_JSON")
        if cred_json_str:
            try:
                cred_dict = json.loads(cred_json_str)
                cred = credentials.Certificate(cred_dict)
                firebase_app = firebase_admin.initialize_app(cred, options={"storageBucket": bucket_name})
            except Exception as e:
                print(f"Failed to initialize firebase from JSON env: {e}")
                firebase_app = None
        
        if not firebase_app and cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_app = firebase_admin.initialize_app(cred, options={"storageBucket": bucket_name})
            
        if not firebase_app:
            # Fallback to initializing with project ID option
            firebase_app = firebase_admin.initialize_app(options={
                "projectId": project_id,
                "storageBucket": bucket_name
            })

    try:
        # Firestore client instance
        db = firestore.client()
        # Storage bucket client instance
        bucket = storage.bucket()
    except Exception:
        from unittest.mock import MagicMock
        db = MagicMock()
        bucket = MagicMock()
