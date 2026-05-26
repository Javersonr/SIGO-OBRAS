import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SalarioInput({ value, onChange, ...props }) {
  return (
    <div>
      <Label>Salário</Label>
      <Input
        type="number"
        value={value || ""}
        onChange={(e) => {
          const val = e.target.value;
          // Permitir vazio ou número válido
          if (val === "" || !isNaN(parseFloat(val))) {
            onChange(val === "" ? "" : parseFloat(val));
          }
        }}
        placeholder="Ex: 2500.00"
        step="0.01"
        className="mt-1.5"
        {...props}
      />
    </div>
  );
}
