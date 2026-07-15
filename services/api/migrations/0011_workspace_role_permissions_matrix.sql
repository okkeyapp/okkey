-- Align built-in workspace role permissions_json with the numeric matrix:
-- 0 = no access, 1 = full access, 2 = own objects only (get/put/delete).
-- post: 0 | 1. Owner/Admin = all 1s. User = all 0s. Resources include settings.

UPDATE roles
SET
  permissions_json = '{
    "settings": {"get":1,"post":1,"put":1,"delete":1},
    "roles": {"get":1,"post":1,"put":1,"delete":1},
    "profiles": {"get":1,"post":1,"put":1,"delete":1},
    "members": {"get":1,"post":1,"put":1,"delete":1},
    "vaults": {"get":1,"post":1,"put":1,"delete":1},
    "billing": {"get":1,"post":1,"put":1,"delete":1}
  }'::jsonb,
  updated_at = now()
WHERE builtin_key IN ('owner', 'admin');

UPDATE roles
SET
  permissions_json = '{
    "settings": {"get":0,"post":0,"put":0,"delete":0},
    "roles": {"get":0,"post":0,"put":0,"delete":0},
    "profiles": {"get":0,"post":0,"put":0,"delete":0},
    "members": {"get":0,"post":0,"put":0,"delete":0},
    "vaults": {"get":0,"post":0,"put":0,"delete":0},
    "billing": {"get":0,"post":0,"put":0,"delete":0}
  }'::jsonb,
  updated_at = now()
WHERE builtin_key = 'user';
