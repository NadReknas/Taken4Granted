-- Lets an alert with states skip nationwide programs and keep only ones targeted to those states.
ALTER TABLE alert_criteria ADD COLUMN include_nationwide boolean NOT NULL DEFAULT true;
