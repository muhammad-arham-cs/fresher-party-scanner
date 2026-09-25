import { createAdminClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';

export interface SystemSettings {
  require_email_for_manual_pass: boolean;
  hourly_email_override: boolean;
}

const DEFAULT_SETTINGS: SystemSettings = {
  require_email_for_manual_pass: true,
  hourly_email_override: false,
};

// In-memory cache with 10-second TTL to avoid hitting DB on rapid operations
let cachedSettings: SystemSettings | null = null;
let cacheExpiry = 0;

/**
 * Fetch current system settings from Supabase (or return defaults).
 */
export async function getSystemSettings(): Promise<SystemSettings> {
  const now = Date.now();
  if (cachedSettings && now < cacheExpiry) {
    return { ...cachedSettings };
  }

  try {
    const supabase = createAdminClient();
    
    // Check primary PM record for system_settings in custom_permissions JSONB
    const { data: pmUser, error } = await supabase
      .from('admin_users')
      .select('custom_permissions')
      .eq('role', 'PROJECT_MANAGER')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !pmUser) {
      return { ...DEFAULT_SETTINGS };
    }

    const perms = (pmUser.custom_permissions as Record<string, any>) || {};
    const settings = perms.system_settings as Partial<SystemSettings> | undefined;

    const merged: SystemSettings = {
      require_email_for_manual_pass:
        typeof settings?.require_email_for_manual_pass === 'boolean'
          ? settings.require_email_for_manual_pass
          : DEFAULT_SETTINGS.require_email_for_manual_pass,
      hourly_email_override:
        typeof settings?.hourly_email_override === 'boolean'
          ? settings.hourly_email_override
          : DEFAULT_SETTINGS.hourly_email_override,
    };

    cachedSettings = merged;
    cacheExpiry = now + 10000; // 10 seconds
    return merged;
  } catch (err) {
    console.error('Failed to load system settings:', err);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Update system settings in Supabase across PM records.
 */
export async function updateSystemSettings(
  partial: Partial<SystemSettings>,
  updatedBy: string
): Promise<{ success: boolean; settings: SystemSettings; error?: string }> {
  try {
    const current = await getSystemSettings();
    const updated: SystemSettings = {
      ...current,
      ...partial,
    };

    const supabase = createAdminClient();

    // Fetch all PM users to sync system settings
    const { data: pmUsers } = await supabase
      .from('admin_users')
      .select('id, custom_permissions')
      .eq('role', 'PROJECT_MANAGER');

    if (pmUsers && pmUsers.length > 0) {
      for (const pm of pmUsers) {
        const perms = (pm.custom_permissions as Record<string, any>) || {};
        const newPerms = {
          ...perms,
          system_settings: updated,
        };

        await supabase
          .from('admin_users')
          .update({ custom_permissions: newPerms })
          .eq('id', pm.id);
      }
    }

    // Invalidate local cache
    cachedSettings = updated;
    cacheExpiry = Date.now() + 10000;

    await logAuditEvent({
      action_type: 'setting_changed',
      performed_by: updatedBy,
      user_role: 'PROJECT_MANAGER',
      details: {
        previous: current,
        updated,
        changed_fields: Object.keys(partial),
      },
    });

    return { success: true, settings: updated };
  } catch (err: any) {
    console.error('Failed to update system settings:', err);
    return { success: false, settings: DEFAULT_SETTINGS, error: err?.message || 'Update failed' };
  }
}
