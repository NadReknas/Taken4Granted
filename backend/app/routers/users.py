from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    ApplicationTracker,
    Bookmark,
    SavedSearch,
    UserProfile,
)
from app.schemas import (
    ApplicationCreate,
    ApplicationResponse,
    ApplicationUpdate,
    BookmarkCreate,
    BookmarkResponse,
    SavedSearchCreate,
    SavedSearchResponse,
    UserProfileCreate,
    UserProfileResponse,
)

router = APIRouter(prefix="/api/users", tags=["users"])


# --- User Profiles ---

@router.post("/profile", response_model=UserProfileResponse)
def create_or_update_profile(
    profile: UserProfileCreate, db: Session = Depends(get_db)
) -> UserProfile:
    existing = db.query(UserProfile).filter_by(email=profile.email).first()
    if existing:
        for key, value in profile.model_dump(exclude_unset=True).items():
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing
    new_profile = UserProfile(**profile.model_dump())
    db.add(new_profile)
    db.commit()
    db.refresh(new_profile)
    return new_profile


@router.get("/profile/{email}", response_model=UserProfileResponse)
def get_profile(email: str, db: Session = Depends(get_db)) -> UserProfile:
    profile = db.query(UserProfile).filter_by(email=email).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


# --- Saved Searches ---

@router.post("/profile/{user_id}/searches", response_model=SavedSearchResponse)
def create_saved_search(
    user_id: int, search: SavedSearchCreate, db: Session = Depends(get_db)
) -> SavedSearch:
    saved = SavedSearch(user_id=user_id, **search.model_dump())
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return saved


@router.get("/profile/{user_id}/searches", response_model=list[SavedSearchResponse])
def get_saved_searches(
    user_id: int, db: Session = Depends(get_db)
) -> list[SavedSearch]:
    return db.query(SavedSearch).filter_by(user_id=user_id).all()


@router.delete("/searches/{search_id}")
def delete_saved_search(search_id: int, db: Session = Depends(get_db)) -> dict:
    s = db.query(SavedSearch).get(search_id)
    if not s:
        raise HTTPException(status_code=404, detail="Saved search not found")
    db.delete(s)
    db.commit()
    return {"deleted": True}


# --- Bookmarks ---

@router.post("/profile/{user_id}/bookmarks", response_model=BookmarkResponse)
def create_bookmark(
    user_id: int, bookmark: BookmarkCreate, db: Session = Depends(get_db)
) -> Bookmark:
    bm = Bookmark(user_id=user_id, **bookmark.model_dump())
    db.add(bm)
    db.commit()
    db.refresh(bm)
    return bm


@router.get("/profile/{user_id}/bookmarks", response_model=list[BookmarkResponse])
def get_bookmarks(user_id: int, db: Session = Depends(get_db)) -> list[Bookmark]:
    return db.query(Bookmark).filter_by(user_id=user_id).all()


@router.delete("/bookmarks/{bookmark_id}")
def delete_bookmark(bookmark_id: int, db: Session = Depends(get_db)) -> dict:
    bm = db.query(Bookmark).get(bookmark_id)
    if not bm:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    db.delete(bm)
    db.commit()
    return {"deleted": True}


# --- Application Tracker ---

@router.post(
    "/profile/{user_id}/applications", response_model=ApplicationResponse
)
def create_application(
    user_id: int, app: ApplicationCreate, db: Session = Depends(get_db)
) -> ApplicationTracker:
    tracker = ApplicationTracker(user_id=user_id, **app.model_dump())
    db.add(tracker)
    db.commit()
    db.refresh(tracker)
    return tracker


@router.get(
    "/profile/{user_id}/applications", response_model=list[ApplicationResponse]
)
def get_applications(
    user_id: int, db: Session = Depends(get_db)
) -> list[ApplicationTracker]:
    return db.query(ApplicationTracker).filter_by(user_id=user_id).all()


@router.patch("/applications/{app_id}", response_model=ApplicationResponse)
def update_application(
    app_id: int, update: ApplicationUpdate, db: Session = Depends(get_db)
) -> ApplicationTracker:
    tracker = db.query(ApplicationTracker).get(app_id)
    if not tracker:
        raise HTTPException(status_code=404, detail="Application not found")
    for key, value in update.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(tracker, key, value)
    db.commit()
    db.refresh(tracker)
    return tracker


@router.delete("/applications/{app_id}")
def delete_application(app_id: int, db: Session = Depends(get_db)) -> dict:
    tracker = db.query(ApplicationTracker).get(app_id)
    if not tracker:
        raise HTTPException(status_code=404, detail="Application not found")
    db.delete(tracker)
    db.commit()
    return {"deleted": True}
