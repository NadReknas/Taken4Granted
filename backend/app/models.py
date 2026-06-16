from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.types import JSON

from app.database import Base


def json_col():
    """Use JSONB on PostgreSQL, plain JSON otherwise."""
    return Column(JSON().with_variant(JSONB, "postgresql"), default=list)


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    state = Column(String(2))
    county = Column(String(255))
    city = Column(String(255))
    citizenship_status = Column(String(50))
    veteran_status = Column(String(50))
    gender = Column(String(50))
    race_ethnicity = Column(String(100))
    age_bracket = Column(String(50))
    income_bracket = Column(String(50))
    disability_status = Column(String(50))
    education_level = Column(String(100))
    homeownership_status = Column(String(50))
    business_owner = Column(Boolean, default=False)
    tribal_affiliation = Column(String(255))
    employment_status = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    saved_searches = relationship("SavedSearch", back_populates="user")
    bookmarks = relationship("Bookmark", back_populates="user")
    applications = relationship("ApplicationTracker", back_populates="user")


class CachedGrant(Base):
    __tablename__ = "cached_grants"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(50), default="federal")
    external_id = Column(String(100), unique=True, index=True)
    opportunity_number = Column(String(255))
    title = Column(String(1000), nullable=False)
    description = Column(Text)
    agency_name = Column(String(500))
    agency_code = Column(String(50))
    award_floor = Column(Float)
    award_ceiling = Column(Float)
    funding_instrument = Column(String(100))
    repayment_required = Column(Boolean, default=False)
    cost_sharing = Column(Boolean, default=False)
    posting_date = Column(String(100))
    close_date = Column(String(100))
    eligibility_types = json_col()
    funding_categories = json_col()
    applicant_types = json_col()
    status = Column(String(50))
    application_url = Column(String(1000))
    agency_contact_name = Column(String(255))
    agency_contact_email = Column(String(255))
    agency_contact_phone = Column(String(100))
    last_synced_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


class SavedSearch(Base):
    __tablename__ = "saved_searches"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user_profiles.id"), nullable=False)
    name = Column(String(255), nullable=False)
    search_criteria = json_col()
    alert_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("UserProfile", back_populates="saved_searches")


class Bookmark(Base):
    __tablename__ = "bookmarks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user_profiles.id"), nullable=False)
    grant_external_id = Column(String(100), nullable=False, index=True)
    grant_title = Column(String(1000))
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("UserProfile", back_populates="bookmarks")


class ApplicationTracker(Base):
    __tablename__ = "application_tracker"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user_profiles.id"), nullable=False)
    grant_external_id = Column(String(100), nullable=False)
    grant_title = Column(String(1000))
    status = Column(
        String(50), default="researching"
    )  # researching, drafting, ready, submitted, awarded, rejected
    notes = Column(Text)
    deadline = Column(String(100))
    submission_date = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("UserProfile", back_populates="applications")
