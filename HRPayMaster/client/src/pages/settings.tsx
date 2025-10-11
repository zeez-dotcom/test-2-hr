import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/http";
import { defaultTemplates } from "@/lib/default-templates";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import type { EmployeeCustomField } from "@shared/schema";

export default function Settings() {
  const { t } = useTranslation();
  const { data: me } = useQuery<any>({ queryKey: ["/api/me"] });
  const { data: company } = useQuery<any>({ queryKey: ["/api/company"] });
  const { data: templates = [] } = useQuery<any[]>({ queryKey: ["/api/templates"] });
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [primaryColor, setPrimaryColor] = useState('');
  const [secondaryColor, setSecondaryColor] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [useAttendance, setUseAttendance] = useState<boolean>(false);
  useEffect(() => {
    if (company && typeof company.useAttendanceForDeductions === 'boolean') {
      setUseAttendance(Boolean(company.useAttendanceForDeductions));
    }
  }, [company]);
  const { toast } = useToast();
  const update = useMutation({
    mutationFn: async () => {
      const payload: any = {};
      if (name) payload.name = name;
      if (primaryColor) payload.primaryColor = primaryColor;
      if (secondaryColor) payload.secondaryColor = secondaryColor;
      if (email) payload.email = email;
      if (phone) payload.phone = phone;
      if (website) payload.website = website;
      if (address) payload.address = address;
      payload.useAttendanceForDeductions = useAttendance;
      if (file) {
        const b64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader(); r.onload = () => resolve(r.result as string); r.onerror = reject; r.readAsDataURL(file);
        });
        payload.logo = b64;
      }
      const res = await apiPut('/api/company', payload);
      if (!res.ok) throw new Error(res.error || 'Failed');
      return res.data;
    },
    onSuccess: () => { toast({ title: 'Updated' }); },
    onError: () => { toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' }); },
  })
  if (!me || me.role !== 'admin') {
    return <div className="text-sm text-muted-foreground">{t('settings.onlyAdmin','Only super admin can access settings.')}</div>;
  }
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">{t('nav.settings')}</h1>
      <Card>
        <CardHeader><CardTitle>{t('settings.company','Company')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox checked={useAttendance || company?.useAttendanceForDeductions} onCheckedChange={(v)=> setUseAttendance(Boolean(v))} />
            <span className="text-sm">{t('settings.useAttendance','Use attendance-based deduction in payroll')}</span>
          </div>
          <div className="space-y-1">
            <label className="text-sm">{t('settings.name','Name')}</label>
            <Input placeholder={company?.name || 'Company'} value={name} onChange={e=>setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-sm">{t('settings.logo','Logo')}</label>
            <Input type="file" accept="image/*" onChange={e=> setFile(e.target.files?.[0] || null)} />
            {company?.logo && (<img src={company.logo} alt="logo" className="h-16 mt-2" />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm">{t('settings.primaryColor','Primary Color')}</label>
              <Input type="color" value={primaryColor || company?.primaryColor || '#0F172A'} onChange={e=>setPrimaryColor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm">{t('settings.secondaryColor','Secondary Color')}</label>
              <Input type="color" value={secondaryColor || company?.secondaryColor || '#64748B'} onChange={e=>setSecondaryColor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm">{t('settings.email','Email')}</label>
              <Input type="email" placeholder={company?.email || 'info@company.com'} value={email} onChange={e=>setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm">{t('settings.phone','Phone')}</label>
              <Input placeholder={company?.phone || '+1 555 123 4567'} value={phone} onChange={e=>setPhone(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm">{t('settings.website','Website')}</label>
              <Input placeholder={company?.website || 'https://example.com'} value={website} onChange={e=>setWebsite(e.target.value)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm">{t('settings.address','Address')}</label>
              <Input placeholder={company?.address || '123 Main St, City, Country'} value={address} onChange={e=>setAddress(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end"><Button onClick={()=>update.mutate()} disabled={update.isPending}>{t('actions.save')}</Button></div>
        </CardContent>
      </Card>

      <CustomFieldsCard />

      <UsersCard />

      {/* Templates management */}
      <TemplatesCard templates={templates} />
    </div>
  );
}

function UsersCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: users = [], refetch } = useQuery<any[]>({ queryKey: ["/api/users"] });
  const [newUser, setNewUser] = useState({ username: "", email: "", password: "", role: "viewer" });
  const [editState, setEditState] = useState<Record<string, { username: string; email: string; role: string }>>({});

  useEffect(() => {
    const next: Record<string, { username: string; email: string; role: string }> = {};
    for (const user of users) {
      next[user.id] = {
        username: user.username || "",
        email: user.email || "",
        role: user.role || "viewer",
      };
    }
    setEditState(next);
  }, [users]);

  const createUser = useMutation({
    mutationFn: async (payload: typeof newUser) => {
      const trimmed = {
        username: payload.username.trim(),
        email: payload.email.trim(),
        password: payload.password,
        role: payload.role,
      };
      const res = await apiPost("/api/users", trimmed);
      if (!res.ok) throw new Error(res.error || "Failed to create user");
      return res.data;
    },
    onSuccess: () => {
      toast({ title: t("settings.userCreated", "User created") });
      setNewUser({ username: "", email: "", password: "", role: "viewer" });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: t("errors.errorTitle", "Error"),
        description: error?.message || t("settings.userCreateFailed", "Could not create user"),
        variant: "destructive",
      });
    },
  });

  const updateUser = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiPut(`/api/users/${id}`, data);
      if (!res.ok) throw new Error(res.error || "Failed to update user");
      return res.data;
    },
    onSuccess: () => {
      toast({ title: t("settings.userUpdated", "User updated") });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: t("errors.errorTitle", "Error"),
        description: error?.message || t("settings.userUpdateFailed", "Could not update user"),
        variant: "destructive",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const endpoint = active ? `/api/users/${id}/reactivate` : `/api/users/${id}/deactivate`;
      const res = await apiPost(endpoint, {});
      if (!res.ok) throw new Error(res.error || "Failed to update status");
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.active
          ? t("settings.userReactivated", "User reactivated")
          : t("settings.userDeactivated", "User deactivated"),
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: t("errors.errorTitle", "Error"),
        description: error?.message || t("settings.userStatusFailed", "Could not update status"),
        variant: "destructive",
      });
    },
  });

  const resetPassword = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const res = await apiPost(`/api/users/${id}/reset-password`, { password });
      if (!res.ok) throw new Error(res.error || "Failed to reset password");
      return res.data;
    },
    onSuccess: () => {
      toast({ title: t("settings.userPasswordReset", "Password reset") });
    },
    onError: (error: any) => {
      toast({
        title: t("errors.errorTitle", "Error"),
        description: error?.message || t("settings.userPasswordFailed", "Could not reset password"),
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    if (!newUser.username.trim() || !newUser.email.trim() || !newUser.password) {
      toast({
        title: t("errors.errorTitle", "Error"),
        description: t("settings.userValidation", "Please provide username, email, password, and role."),
        variant: "destructive",
      });
      return;
    }
    createUser.mutate(newUser);
  };

  const handleSave = (user: any) => {
    const state = editState[user.id];
    if (!state) return;
    const payload: Record<string, any> = {};
    if (state.username.trim() && state.username.trim() !== user.username) {
      payload.username = state.username.trim();
    }
    if (state.email.trim() && state.email.trim() !== user.email) {
      payload.email = state.email.trim();
    }
    if (state.role !== user.role) {
      payload.role = state.role;
    }
    if (Object.keys(payload).length === 0) {
      toast({ title: t("settings.noChanges", "No changes to save") });
      return;
    }
    updateUser.mutate({ id: user.id, data: payload });
  };

  const handleReset = (user: any) => {
    const password = window.prompt(
      t("settings.promptNewPassword", "Enter a new password for {{username}}", { username: user.username }),
    );
    if (!password) return;
    resetPassword.mutate({ id: user.id, password });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.userManagement", "User Management")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-medium text-sm text-muted-foreground">{t("settings.addUser", "Add user")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Input
              placeholder={t("settings.username", "Username")}
              value={newUser.username}
              onChange={(e) => setNewUser((prev) => ({ ...prev, username: e.target.value }))}
            />
            <Input
              type="email"
              placeholder={t("settings.email", "Email")}
              value={newUser.email}
              onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
            />
            <Input
              type="password"
              placeholder={t("settings.password", "Password")}
              value={newUser.password}
              onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
            />
            <select
              className="border rounded px-2 py-2 text-sm"
              value={newUser.role}
              onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value }))}
            >
              <option value="admin">{t("roles.admin", "Admin")}</option>
              <option value="hr">{t("roles.hr", "HR")}</option>
              <option value="viewer">{t("roles.viewer", "Viewer")}</option>
              <option value="employee">{t("roles.employee", "Employee")}</option>
            </select>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleCreate} disabled={createUser.isPending}>
              {t("settings.addUserCta", "Create user")}
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="font-medium text-sm text-muted-foreground">{t("settings.manageUsers", "Existing users")}</h3>
          {users.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("settings.noUsers", "No users found.")}</div>
          ) : (
            <div className="space-y-3">
              {users.map((user: any) => {
                const state = editState[user.id] || { username: "", email: "", role: "viewer" };
                const hasChanges =
                  state.username.trim() !== (user.username || "") ||
                  state.email.trim() !== (user.email || "") ||
                  state.role !== (user.role || "viewer");
                return (
                  <div
                    key={user.id}
                    className="border rounded-lg p-3 space-y-3 md:space-y-0 md:grid md:grid-cols-[1.5fr,1.5fr,1fr,auto] md:items-center md:gap-3"
                  >
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">{t("settings.username", "Username")}</label>
                      <Input
                        value={state.username}
                        onChange={(e) =>
                          setEditState((prev) => ({
                            ...prev,
                            [user.id]: { ...state, username: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">{t("settings.email", "Email")}</label>
                      <Input
                        type="email"
                        value={state.email}
                        onChange={(e) =>
                          setEditState((prev) => ({
                            ...prev,
                            [user.id]: { ...state, email: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">{t("settings.role", "Role")}</label>
                      <select
                        className="border rounded px-2 py-2 text-sm w-full"
                        value={state.role}
                        onChange={(e) =>
                          setEditState((prev) => ({
                            ...prev,
                            [user.id]: { ...state, role: e.target.value },
                          }))
                        }
                      >
                        <option value="admin">{t("roles.admin", "Admin")}</option>
                        <option value="hr">{t("roles.hr", "HR")}</option>
                        <option value="viewer">{t("roles.viewer", "Viewer")}</option>
                        <option value="employee">{t("roles.employee", "Employee")}</option>
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2 items-center justify-end">
                      <span className="text-xs px-2 py-1 rounded-full border text-muted-foreground">
                        {user.active ? t("settings.userActive", "Active") : t("settings.userInactive", "Inactive")}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => statusMutation.mutate({ id: user.id, active: !user.active })}
                        disabled={statusMutation.isPending}
                      >
                        {user.active ? t("settings.deactivate", "Deactivate") : t("settings.reactivate", "Reactivate")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReset(user)}
                        disabled={resetPassword.isPending}
                      >
                        {t("settings.resetPassword", "Reset password")}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSave(user)}
                        disabled={!hasChanges || updateUser.isPending}
                      >
                        {t("actions.save", "Save")}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CustomFieldsCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newFieldName, setNewFieldName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const {
    data: customFields = [],
    isLoading,
    error,
  } = useQuery<EmployeeCustomField[]>({
    queryKey: ["/api/employees/custom-fields"],
    queryFn: async () => {
      const res = await apiGet("/api/employees/custom-fields");
      if (!res.ok) {
        throw new Error(res.error || "Failed to load custom fields");
      }
      return res.data as EmployeeCustomField[];
    },
  });

  useEffect(() => {
    setDrafts(prev => {
      const next: Record<string, string> = {};
      for (const field of customFields) {
        next[field.id] = Object.prototype.hasOwnProperty.call(prev, field.id)
          ? prev[field.id]
          : field.name;
      }
      return next;
    });
  }, [customFields]);

  const createField = useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error(t("settings.fieldNameRequired", "Field name is required"));
      const res = await apiPost("/api/employees/custom-fields", { name: trimmed });
      if (!res.ok) {
        throw new Error(res.error || "Failed to create field");
      }
      return res.data as EmployeeCustomField;
    },
    onSuccess: () => {
      setNewFieldName("");
      queryClient.invalidateQueries({ queryKey: ["/api/employees/custom-fields"] });
      toast({ title: t("settings.customFieldAdded", "Custom field added") });
    },
    onError: (err: any) => {
      toast({
        title: t("errors.errorTitle", "Error"),
        description: err?.message || t("settings.customFieldAddFailed", "Could not add field"),
        variant: "destructive",
      });
    },
  });

  const updateField = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error(t("settings.fieldNameRequired", "Field name is required"));
      const res = await apiPut(`/api/employees/custom-fields/${id}`, { name: trimmed });
      if (!res.ok) {
        throw new Error(res.error || "Failed to update field");
      }
      return res.data as EmployeeCustomField;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees/custom-fields"] });
      toast({ title: t("settings.customFieldUpdated", "Custom field updated") });
      setDrafts(prev => ({ ...prev, [id]: prev[id]?.trim() ?? "" }));
    },
    onError: (err: any) => {
      toast({
        title: t("errors.errorTitle", "Error"),
        description: err?.message || t("settings.customFieldUpdateFailed", "Could not update field"),
        variant: "destructive",
      });
    },
  });

  const deleteField = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiDelete(`/api/employees/custom-fields/${id}`);
      if (!res.ok) {
        throw new Error(res.error || "Failed to delete field");
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees/custom-fields"] });
      toast({ title: t("settings.customFieldDeleted", "Custom field deleted") });
    },
    onError: (err: any) => {
      toast({
        title: t("errors.errorTitle", "Error"),
        description: err?.message || t("settings.customFieldDeleteFailed", "Could not delete field"),
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.customFieldsTitle", "Custom Employee Fields")}</CardTitle>
        <CardDescription>
          {t(
            "settings.customFieldsDescription",
            "Define organization-specific fields that appear on employee forms.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full space-y-1 sm:max-w-xs">
            <label className="text-sm text-muted-foreground" htmlFor="new-custom-field">
              {t("settings.fieldName", "Field name")}
            </label>
            <Input
              id="new-custom-field"
              value={newFieldName}
              onChange={(event) => setNewFieldName(event.target.value)}
              placeholder={t("settings.fieldNamePlaceholder", "e.g. Favorite color")}
            />
          </div>
          <Button
            type="button"
            onClick={() => createField.mutate(newFieldName)}
            disabled={createField.isPending || newFieldName.trim() === ""}
          >
            {createField.isPending
              ? t("settings.addingField", "Adding...")
              : t("settings.addField", "Add field")}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("settings.loadingFields", "Loading fields...")}</p>
        ) : error ? (
          <p className="text-sm text-red-500">
            {error instanceof Error
              ? error.message
              : t("settings.customFieldLoadFailed", "Failed to load custom fields")}
          </p>
        ) : customFields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("settings.noCustomFields", "No custom fields yet. Add one above to get started.")}
          </p>
        ) : (
          <div className="space-y-3">
            {customFields.map((field) => {
              const draft = drafts[field.id] ?? "";
              const trimmed = draft.trim();
              const unchanged = trimmed === field.name.trim();
              return (
                <div
                  key={field.id}
                  className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center"
                >
                  <Input
                    value={draft}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [field.id]: event.target.value,
                      }))
                    }
                    className="sm:max-w-sm"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => updateField.mutate({ id: field.id, name: draft })}
                      disabled={updateField.isPending || trimmed === "" || unchanged}
                    >
                      {updateField.isPending ? t("actions.saving", "Saving...") : t("actions.save", "Save")}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteField.mutate(field.id)}
                      disabled={deleteField.isPending}
                    >
                      {t("actions.delete", "Delete")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TemplatesCard({ templates }: { templates: any[] }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [active, setActive] = useState<'noc'|'offer'|'warning'|'experience'>('noc');
  const map = Object.fromEntries((templates||[]).map((r:any)=> [r.key, r]));
  const [enVal, setEnVal] = useState<string>('');
  const [arVal, setArVal] = useState<string>('');
  const syncDefaults = (key: typeof active) => {
    const d = (defaultTemplates as any)[key];
    setEnVal(d?.en || '');
    setArVal(d?.ar || '');
  };
  useEffect(() => {
    const row = map[active];
    if (row) {
      setEnVal(row.en || '');
      setArVal(row.ar || '');
    } else {
      const d = (defaultTemplates as any)[active] || {};
      setEnVal(d.en || '');
      setArVal(d.ar || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, templates?.length]);
  const save = useMutation({
    mutationFn: async () => {
      const res = await apiPut(`/api/templates/${active}`, { en: enVal, ar: arVal });
      if (!res.ok) throw new Error(res.error || 'Failed');
      return res.data;
    },
    onSuccess: () => toast({ title: t('actions.save','Saved') }),
    onError: () => toast({ title: t('errors.errorTitle','Error'), description: t('errors.general','An unexpected error occurred'), variant: 'destructive' }),
  });
  return (
    <Card>
      <CardHeader><CardTitle>{t('settings.templates','Templates')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm">{t('settings.templateType','Template')}</label>
            <select className="border rounded px-2 py-1 w-full" value={active} onChange={(e)=>{ setEnVal(''); setArVal(''); setActive(e.target.value as any); }}>
              <option value="noc">{t('docgen.noc','No Objection Certificate')}</option>
              <option value="offer">{t('docgen.offer','Employment Offer')}</option>
              <option value="warning">{t('docgen.warning','Warning Notice')}</option>
              <option value="experience">{t('docgen.experience','Experience Letter')}</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm">{t('docgen.englishText','English Text')}</label>
            <textarea className="border rounded w-full h-40 p-2 text-sm" value={enVal} onChange={(e)=> setEnVal(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">{t('docgen.arabicText','Arabic Text')}</label>
            <textarea dir="rtl" className="border rounded w-full h-40 p-2 text-sm" value={arVal} onChange={(e)=> setArVal(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-2 justify-end">
          <Button variant="outline" onClick={()=> syncDefaults(active)}>{t('actions.reset','Reset')}</Button>
          <Button onClick={()=> save.mutate()} disabled={save.isPending}>{t('actions.save','Save')}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
