ALTER TABLE opportunities ADD COLUMN funding_types text[] NOT NULL DEFAULT '{other}';
CREATE INDEX opportunities_funding_types_idx ON opportunities USING gin(funding_types);

-- Backfill until the next ingest recomputes it: Grants.gov and the CA portal list grants;
-- other sources mirror inferFundingTypes() (title first, summary only when the title is silent).
UPDATE opportunities SET funding_types = '{grant}' WHERE source_id LIKE 'grants_gov%' OR source_id = 'ca_grants_portal';

WITH typed AS (
  SELECT id, array_remove(ARRAY[
      CASE WHEN t ~* '\y(grants?|cooperative agreements?|matching funds)\y' THEN 'grant' END,
      CASE WHEN t ~* '\y(loans?|lending|relending|revolving (loan )?fund|financing|bonds?)\y' THEN 'loan' END,
      CASE WHEN t ~* '\y(tax (credits?|exemptions?|abatements?|incentives?|refunds?|increment)|sales tax|property tax|rebates?|enterprise zones?|opportunity zones?)\y' THEN 'tax_incentive' END,
      CASE WHEN t ~* '\y(disasters?|hazard mitigation|emergency (relief|assistance)|recovery assistance)\y' THEN 'disaster_aid' END
    ], NULL) AS types
  FROM (
    SELECT id,
           CASE WHEN title ~* '\y(grants?|cooperative agreements?|matching funds|loans?|lending|relending|revolving|financing|bonds?|tax|rebates?|enterprise zones?|opportunity zones?|disasters?|hazard mitigation|emergency|recovery assistance)\y'
                THEN title ELSE coalesce(summary, '') END AS t
    FROM opportunities
    WHERE NOT (source_id LIKE 'grants_gov%' OR source_id = 'ca_grants_portal')
  ) s
)
UPDATE opportunities o SET funding_types = typed.types FROM typed WHERE o.id = typed.id AND cardinality(typed.types) > 0;

-- Existing alerts keep every type they could match before; disaster aid is new and opt-in.
ALTER TABLE alert_criteria ADD COLUMN funding_types text[] NOT NULL DEFAULT '{grant,loan,tax_incentive,other}';
ALTER TABLE alert_criteria ALTER COLUMN funding_types SET DEFAULT '{grant,other}';
