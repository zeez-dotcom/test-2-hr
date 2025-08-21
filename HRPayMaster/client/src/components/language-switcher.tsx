import { useState } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import i18n from "@/lib/i18n";

const languages = [
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
];

export default function LanguageSwitcher() {
  const [language, setLanguage] = useState(i18n.language);

  const handleChange = (value: string) => {
    i18n.changeLanguage(value);
    if (typeof window !== "undefined") {
      localStorage.setItem("language", value);
    }
    setLanguage(value);
  };

  return (
    <Select value={language} onValueChange={handleChange}>
      <SelectTrigger className="w-[120px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {languages.map((lng) => (
          <SelectItem key={lng.code} value={lng.code}>
            {lng.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

