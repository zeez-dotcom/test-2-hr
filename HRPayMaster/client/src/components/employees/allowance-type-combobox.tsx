import { forwardRef, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAllowanceTypes, useCreateAllowanceType } from "@/lib/allowance-types";
import { useToast } from "@/hooks/use-toast";
import { toastApiError } from "@/lib/toastError";

interface AllowanceTypeComboboxProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  extraOptions?: string[];
}

interface Option {
  id: string;
  name: string;
}

const AllowanceTypeCombobox = forwardRef<HTMLDivElement, AllowanceTypeComboboxProps>(
  (
    {
      value,
      onChange,
      placeholder = "Select allowance type",
      disabled,
      extraOptions = [],
      className,
      ...rest
    },
    ref,
  ) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const { toast } = useToast();

    const { data: allowanceTypes = [], isLoading } = useAllowanceTypes();

    const createMutation = useCreateAllowanceType({
      onSuccess: type => {
        onChange(type.name);
        setSearch("");
        setOpen(false);
        toast({ title: "Allowance type added" });
      },
      onError: error => {
        toastApiError(error, "Failed to create allowance type");
      },
    });

    const normalizedValue = value?.trim() ?? "";

    const options = useMemo<Option[]>(() => {
      const map = new Map<string, Option>();
      const addOption = (name: string | null | undefined, id: string) => {
        if (!name) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        const key = trimmed.toLowerCase();
        if (map.has(key)) return;
        map.set(key, { id, name: trimmed });
      };

      allowanceTypes.forEach(type => addOption(type.name, type.id));
      extraOptions.forEach((label, index) => addOption(label, `extra-${index}`));
      if (normalizedValue) {
        addOption(normalizedValue, "current");
      }

      return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [allowanceTypes, extraOptions, normalizedValue]);

    const selected = options.find(option => option.name.toLowerCase() === normalizedValue.toLowerCase());
    const buttonLabel = selected?.name || normalizedValue || (isLoading ? "Loading allowance types..." : placeholder);

    const trimmedSearch = search.trim();
    const handleSelect = (name: string) => {
      onChange(name);
      setOpen(false);
      setSearch("");
    };

    const handleCreate = () => {
      if (!trimmedSearch || createMutation.isPending) {
        return;
      }
      createMutation.mutate({ name: trimmedSearch });
    };

    return (
      <div ref={ref} className={cn("w-full", className)} {...rest}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-busy={isLoading || createMutation.isPending}
              className="w-full justify-between"
              disabled={disabled}
              data-testid="allowance-type-trigger"
              onClick={() => {
                if (disabled) return;
                setOpen(prev => !prev);
              }}
            >
              <span className="truncate">{buttonLabel}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[320px]" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search allowances..."
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                <CommandEmpty>
                  {createMutation.isPending ? (
                    <span className="px-2 py-3 text-sm text-muted-foreground">Creating allowance type...</span>
                  ) : trimmedSearch ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-auto w-full justify-start px-2 py-3"
                      onMouseDown={event => event.preventDefault()}
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        handleCreate();
                      }}
                      data-testid="allowance-type-create"
                    >
                      <Plus className="mr-2 h-4 w-4" /> Create "{trimmedSearch}"
                    </Button>
                  ) : (
                    <span className="px-2 py-3 text-sm text-muted-foreground">No allowance types found.</span>
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {options.map(option => (
                    <CommandItem
                      key={option.id}
                      value={option.name}
                      onSelect={() => handleSelect(option.name)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          option.name.toLowerCase() === normalizedValue.toLowerCase()
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {option.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    );
  },
);

AllowanceTypeCombobox.displayName = "AllowanceTypeCombobox";

export default AllowanceTypeCombobox;
