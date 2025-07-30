import os
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.db.models import User

def ensure_admin():
    db: Session = SessionLocal()
    try:
        admin_username = os.getenv("ADMIN_USERNAME", "admin")
        print(f"Attempting to ensure '{admin_username}' is an admin...")

        user = db.query(User).filter(User.username == admin_username).first()

        if not user:
            print(f"Error: User '{admin_username}' not found in the database.")
            return

        if user.role == "admin":
            print(f"User '{admin_username}' is already an admin.")
        else:
            print(f"User '{admin_username}' is not an admin. Promoting...")
            user.role = "admin"
            db.commit()
            print(f"User '{admin_username}' has been promoted to admin.")
        
        db.refresh(user)
        print(f"Final check: User '{user.username}', Role: '{user.role}'")

    finally:
        db.close()

if __name__ == "__main__":
    ensure_admin()