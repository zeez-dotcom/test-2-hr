export type Brand = {
  name: string;
  logo?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
};

export function getBrand(): Brand {
  try {
    if (typeof window !== 'undefined') {
      const name = (window as any).__companyName || 'HRPayMaster';
      const logo = (window as any).__companyLogo || (import.meta as any)?.env?.VITE_COMPANY_LOGO || null;
      const primaryColor = (window as any).__companyPrimaryColor || (import.meta as any)?.env?.VITE_PRIMARY_COLOR || null;
      const secondaryColor = (window as any).__companySecondaryColor || (import.meta as any)?.env?.VITE_SECONDARY_COLOR || null;
      const email = (window as any).__companyEmail || null;
      const phone = (window as any).__companyPhone || null;
      const website = (window as any).__companyWebsite || null;
      const address = (window as any).__companyAddress || null;
      return { name, logo, primaryColor, secondaryColor, email, phone, website, address };
    }
  } catch {}
  // SSR/test fallback
  const name = (import.meta as any)?.env?.VITE_COMPANY_NAME || 'HRPayMaster';
  const logo = (import.meta as any)?.env?.VITE_COMPANY_LOGO || null;
  const primaryColor = (import.meta as any)?.env?.VITE_PRIMARY_COLOR || null;
  const secondaryColor = (import.meta as any)?.env?.VITE_SECONDARY_COLOR || null;
  return { name, logo, primaryColor, secondaryColor };
}
