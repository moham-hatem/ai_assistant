import { AUTH_ROLES, type AuthRole } from '../../../../shared/contracts/auth';
import type { AccessCopy } from '../access-copy';

interface RoleSelectorProps {
  copy: AccessCopy;
  disabled?: boolean;
  name: string;
  onChange: (roles: AuthRole[]) => void;
  roles: AuthRole[];
}

export function RoleSelector({ copy, disabled, name, onChange, roles }: RoleSelectorProps) {
  function toggle(role: AuthRole, checked: boolean) {
    onChange(AUTH_ROLES.filter((item) => item === role ? checked : roles.includes(item)));
  }

  return (
    <fieldset className="access-role-selector" disabled={disabled}>
      <legend>{copy.rolesHeading}</legend>
      {AUTH_ROLES.map((role) => (
        <label key={role}>
          <input
            checked={roles.includes(role)}
            name={name}
            onChange={(event) => toggle(role, event.target.checked)}
            type="checkbox"
            value={role}
          />
          <span><strong>{copy.roles[role].label}</strong><small>{copy.roles[role].description}</small></span>
        </label>
      ))}
    </fieldset>
  );
}
