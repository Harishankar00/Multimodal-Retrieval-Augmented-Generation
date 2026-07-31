import os
import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase Admin SDK
firebase_app = None
# Look for credentials path in environment variables
cred_path = os.getenv("FIREBASE_CREDENTIALS")
db = None

if os.getenv("TESTING") == "True":
    from unittest.mock import MagicMock
    db = MagicMock()
else:
    if not firebase_admin._apps:
        if cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_app = firebase_admin.initialize_app(cred)
        else:
            # Fallback to initializing with project ID option
            project_id = os.getenv("FIREBASE_PROJECT_ID", "multimodel-rag-project")
            firebase_app = firebase_admin.initialize_app(options={
                "projectId": project_id
            })

    try:
        # Firestore client instance
        db = firestore.client()
    except Exception:
        from unittest.mock import MagicMock
        db = MagicMock()
