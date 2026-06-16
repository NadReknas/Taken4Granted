from datetime import datetime
from typing import Any

from pydantic import BaseModel


# --- Grant Search ---

class GrantSearchRequest(BaseModel):
    keyword: str = ""
    eligibilities: str = ""  # Empty = all applicant types; "21" = Individuals only
    agencies: str = ""
    opp_statuses: str = "forecasted|posted"
    funding_categories: str = ""
    rows: int = 25
    page: int = 1
    sort_by: str = ""
    award_floor: float | None = None
    award_ceiling: float | None = None


class GrantSummary(BaseModel):
    id: int
    opportunity_number: str
    title: str
    agency: str | None = None
    award_floor: float | None = None
    award_ceiling: float | None = None
    close_date: str | None = None
    posting_date: str | None = None
    status: str | None = None
    funding_instrument: str | None = None
    cost_sharing: bool = False
    applicant_types: list[dict[str, Any]] = []
    funding_categories: list[dict[str, Any]] = []


class GrantDetail(BaseModel):
    id: int
    opportunity_number: str
    title: str
    description: str | None = None
    agency_name: str | None = None
    agency_code: str | None = None
    award_floor: float | None = None
    award_ceiling: float | None = None
    posting_date: str | None = None
    close_date: str | None = None
    cost_sharing: bool = False
    funding_instruments: list[dict[str, Any]] = []
    funding_categories: list[dict[str, Any]] = []
    applicant_types: list[dict[str, Any]] = []
    agency_contact_name: str | None = None
    agency_contact_email: str | None = None
    agency_contact_phone: str | None = None
    application_url: str | None = None
    attachments: list[dict[str, Any]] = []
    alns: list[dict[str, Any]] = []


class GrantSearchResponse(BaseModel):
    total: int
    page: int
    rows: int
    results: list[GrantSummary]


# --- User Profile ---

class UserProfileCreate(BaseModel):
    email: str
    name: str
    state: str | None = None
    county: str | None = None
    city: str | None = None
    citizenship_status: str | None = None
    veteran_status: str | None = None
    gender: str | None = None
    race_ethnicity: str | None = None
    age_bracket: str | None = None
    income_bracket: str | None = None
    disability_status: str | None = None
    education_level: str | None = None
    homeownership_status: str | None = None
    business_owner: bool = False
    tribal_affiliation: str | None = None
    employment_status: str | None = None


class UserProfileResponse(UserProfileCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Saved Searches ---

class SavedSearchCreate(BaseModel):
    name: str
    search_criteria: dict[str, Any]
    alert_enabled: bool = False


class SavedSearchResponse(SavedSearchCreate):
    id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Bookmarks ---

class BookmarkCreate(BaseModel):
    grant_external_id: str
    grant_title: str | None = None
    notes: str | None = None


class BookmarkResponse(BookmarkCreate):
    id: int
    user_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Application Tracker ---

class ApplicationCreate(BaseModel):
    grant_external_id: str
    grant_title: str | None = None
    status: str = "researching"
    notes: str | None = None
    deadline: str | None = None


class ApplicationUpdate(BaseModel):
    status: str | None = None
    notes: str | None = None
    deadline: str | None = None
    submission_date: datetime | None = None


class ApplicationResponse(BaseModel):
    id: int
    user_id: int
    grant_external_id: str
    grant_title: str | None = None
    status: str
    notes: str | None = None
    deadline: str | None = None
    submission_date: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
