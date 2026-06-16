from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

# Support both sync and async URLs
db_url = settings.database_url
if db_url.startswith("postgresql://"):
    sync_url = db_url
elif db_url.startswith("postgres://"):
    sync_url = db_url.replace("postgres://", "postgresql://", 1)
else:
    sync_url = db_url

engine = create_engine(sync_url, echo=False)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
