-- Migration 011: Replace redundant consent flag pairs with clearly named columns
--
-- The volunteers table had two pairs of overlapping columns:
--   profile_visible (live toggle) + consent_profile_visible (GDPR audit flag)
--   share_contact_directly (live preference) + consent_contact_by_owners (GDPR audit flag)
--
-- These are replaced with three clearly named consent columns:
--   consent_make_profile_visible_in_directory  — merges profile_visible + consent_profile_visible
--   consent_contactable_by_project_owners      — replaces consent_contact_by_owners (can contact via form)
--   consent_share_contact_info_with_project_owner — replaces share_contact_directly (direct details)
--
-- Merge rule for profile visibility: 1 if either old column was 1.
-- Contact columns are copied directly (they were always separate concepts).
-- consent_given_at is backfilled where a row gains any true value without a timestamp.

ALTER TABLE volunteers ADD COLUMN consent_make_profile_visible_in_directory BOOLEAN DEFAULT FALSE;
ALTER TABLE volunteers ADD COLUMN consent_contactable_by_project_owners BOOLEAN DEFAULT FALSE;
ALTER TABLE volunteers ADD COLUMN consent_share_contact_info_with_project_owner BOOLEAN DEFAULT FALSE;

UPDATE volunteers
SET
    consent_make_profile_visible_in_directory = (profile_visible = 1 OR consent_profile_visible = 1),
    consent_contactable_by_project_owners = (consent_contact_by_owners = 1),
    consent_share_contact_info_with_project_owner = (share_contact_directly = 1),
    consent_given_at = CASE
        WHEN consent_given_at IS NOT NULL THEN consent_given_at
        WHEN (profile_visible = 1 OR consent_profile_visible = 1
              OR consent_contact_by_owners = 1 OR share_contact_directly = 1)
        THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        ELSE NULL
    END;

ALTER TABLE volunteers DROP COLUMN profile_visible;
ALTER TABLE volunteers DROP COLUMN consent_profile_visible;
ALTER TABLE volunteers DROP COLUMN share_contact_directly;
ALTER TABLE volunteers DROP COLUMN consent_contact_by_owners;
