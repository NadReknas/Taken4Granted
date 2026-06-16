"""Client for the Grants.gov REST API (no auth required)."""

import httpx

from app.config import settings
from app.schemas import GrantDetail, GrantSearchResponse, GrantSummary

BASE_URL = settings.grants_gov_api_url
TIMEOUT = 30.0


def _parse_float(val: str | int | float | None) -> float | None:
    if val is None:
        return None
    try:
        return float(str(val).replace(",", ""))
    except (ValueError, TypeError):
        return None


async def search_grants(
    keyword: str = "",
    eligibilities: str = "21",
    agencies: str = "",
    opp_statuses: str = "forecasted|posted",
    funding_categories: str = "",
    rows: int = 25,
    page: int = 1,
    sort_by: str = "",
    award_floor: float | None = None,
    award_ceiling: float | None = None,
) -> GrantSearchResponse:
    """Search Grants.gov opportunities via the search2 endpoint."""
    payload: dict = {
        "keyword": keyword,
        "oppStatuses": opp_statuses,
        "rows": rows,
    }
    if eligibilities:
        payload["eligibilities"] = eligibilities
    if agencies:
        payload["agencies"] = agencies
    if funding_categories:
        payload["fundingCategories"] = funding_categories
    if sort_by:
        payload["sortBy"] = sort_by

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(
            f"{BASE_URL}/search2",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()

    hits = data.get("data", {}).get("oppHits", [])
    total = data.get("data", {}).get("totalCount", 0)

    results: list[GrantSummary] = []
    for hit in hits:
        opp_floor = _parse_float(hit.get("awardFloor"))
        opp_ceiling = _parse_float(hit.get("awardCeiling"))

        if award_floor is not None and opp_ceiling is not None:
            if opp_ceiling < award_floor:
                continue
        if award_ceiling is not None and opp_floor is not None:
            if opp_floor > award_ceiling:
                continue

        results.append(
            GrantSummary(
                id=hit.get("id", 0),
                opportunity_number=hit.get("number", ""),
                title=hit.get("title", ""),
                agency=hit.get("agency", hit.get("agencyCode", "")),
                award_floor=opp_floor,
                award_ceiling=opp_ceiling,
                close_date=hit.get("closeDate") or hit.get("closeDateStr"),
                posting_date=hit.get("openDate") or hit.get("postingDateStr"),
                status=hit.get("oppStatus", ""),
                funding_instrument=hit.get("fundingInstrument"),
                cost_sharing=hit.get("costSharing", False),
                applicant_types=hit.get("applicantTypes", []),
                funding_categories=hit.get("fundingCategories", []),
            )
        )

    return GrantSearchResponse(
        total=total,
        page=page,
        rows=rows,
        results=results,
    )


async def fetch_opportunity(opportunity_id: int) -> GrantDetail:
    """Fetch full details for a single opportunity."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(
            f"{BASE_URL}/fetchOpportunity",
            json={"opportunityId": opportunity_id},
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()

    opp = data.get("data", {})
    synopsis = opp.get("synopsis", {})

    attachments = []
    for folder in opp.get("synopsisAttachmentFolders", []):
        for att in folder.get("synopsisAttachments", []):
            attachments.append(
                {
                    "fileName": att.get("fileName", ""),
                    "mimeType": att.get("mimeType", ""),
                    "fileDescription": att.get("fileDescription", ""),
                    "folderId": folder.get("id"),
                    "folderType": folder.get("folderType", ""),
                }
            )

    return GrantDetail(
        id=opp.get("id", 0),
        opportunity_number=opp.get("opportunityNumber", ""),
        title=opp.get("opportunityTitle", ""),
        description=synopsis.get("synopsisDesc", ""),
        agency_name=synopsis.get("agencyName", ""),
        agency_code=opp.get("owningAgencyCode", ""),
        award_floor=_parse_float(synopsis.get("awardFloor")),
        award_ceiling=_parse_float(synopsis.get("awardCeiling")),
        posting_date=synopsis.get("postingDate"),
        close_date=synopsis.get("responseDateDesc") or synopsis.get("archiveDate"),
        cost_sharing=synopsis.get("costSharing", False),
        funding_instruments=synopsis.get("fundingInstruments", []),
        funding_categories=synopsis.get("fundingActivityCategories", []),
        applicant_types=synopsis.get("applicantTypes", []),
        agency_contact_name=synopsis.get("agencyContactName"),
        agency_contact_email=synopsis.get("agencyContactEmail"),
        agency_contact_phone=synopsis.get("agencyContactPhone"),
        application_url=f"https://www.grants.gov/search-results-detail/{opp.get('id', '')}",
        attachments=attachments,
        alns=opp.get("alns", []),
    )
