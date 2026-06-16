from fastapi import APIRouter, HTTPException

from app.grants_client import fetch_opportunity, search_grants
from app.schemas import GrantDetail, GrantSearchRequest, GrantSearchResponse

router = APIRouter(prefix="/api/grants", tags=["grants"])


@router.post("/search", response_model=GrantSearchResponse)
async def search(req: GrantSearchRequest) -> GrantSearchResponse:
    """Search Grants.gov for matching opportunities."""
    try:
        return await search_grants(
            keyword=req.keyword,
            eligibilities=req.eligibilities,
            agencies=req.agencies,
            opp_statuses=req.opp_statuses,
            funding_categories=req.funding_categories,
            rows=req.rows,
            page=req.page,
            sort_by=req.sort_by,
            award_floor=req.award_floor,
            award_ceiling=req.award_ceiling,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Grants.gov API error: {e}")


@router.get("/detail/{opportunity_id}", response_model=GrantDetail)
async def detail(opportunity_id: int) -> GrantDetail:
    """Fetch full details for a specific grant opportunity."""
    try:
        return await fetch_opportunity(opportunity_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Grants.gov API error: {e}")


# --- Reference data for UI dropdowns ---

FUNDING_CATEGORIES = {
    "AG": "Agriculture",
    "AR": "Arts",
    "BC": "Business & Commerce",
    "CD": "Community Development",
    "CP": "Consumer Protection",
    "DPR": "Disaster Prevention & Relief",
    "ED": "Education",
    "ELT": "Employment, Labor & Training",
    "EN": "Energy",
    "ENV": "Environment",
    "FN": "Food & Nutrition",
    "HL": "Health",
    "HO": "Housing",
    "HU": "Humanities",
    "IS": "Information & Statistics",
    "ISS": "Income Security & Social Services",
    "LJL": "Law, Justice & Legal",
    "NR": "Natural Resources",
    "O": "Other",
    "RA": "Regional Development",
    "RD": "Science, Technology & Info",
    "ST": "Transportation",
}

APPLICANT_TYPES = {
    "00": "State governments",
    "01": "County governments",
    "02": "City or township governments",
    "04": "Special district governments",
    "05": "Independent school districts",
    "06": "Public/State institutions of higher education",
    "07": "Native American tribal governments (Federally recognized)",
    "08": "Public housing authorities",
    "11": "Native American tribal organizations",
    "12": "Nonprofits with 501(c)(3)",
    "13": "Nonprofits without 501(c)(3)",
    "20": "Private institutions of higher education",
    "21": "Individuals",
    "22": "For-profit organizations (non-small business)",
    "23": "Small businesses",
    "25": "Others",
    "99": "Unrestricted",
}

AGENCIES = {
    "HHS": "Health & Human Services",
    "DOE": "Department of Energy",
    "USDA": "Department of Agriculture",
    "HUD": "Housing & Urban Development",
    "DOJ": "Department of Justice",
    "DOC": "Department of Commerce",
    "DOD": "Department of Defense",
    "DOI": "Department of the Interior",
    "DOL": "Department of Labor",
    "DOT": "Department of Transportation",
    "ED": "Department of Education",
    "EPA": "Environmental Protection Agency",
    "NASA": "NASA",
    "NSF": "National Science Foundation",
    "SBA": "Small Business Administration",
    "VA": "Department of Veterans Affairs",
    "FEMA": "Federal Emergency Management Agency",
    "TREAS": "Department of the Treasury",
    "DHS": "Department of Homeland Security",
    "STATE": "Department of State",
}


@router.get("/reference/funding-categories")
async def get_funding_categories() -> dict:
    return FUNDING_CATEGORIES


@router.get("/reference/applicant-types")
async def get_applicant_types() -> dict:
    return APPLICANT_TYPES


@router.get("/reference/agencies")
async def get_agencies() -> dict:
    return AGENCIES
