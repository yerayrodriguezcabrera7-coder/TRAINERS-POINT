import { ApiError } from "../calendar/model";

// This is a business restriction for every panel role, including administrators.
// Future app purchases must use a separate verified payment workflow, not a flag
// supplied by the panel to bypass this rule.
export function assertManualPackageAllowed(client: { brand: string }) {
  if (client.brand === "COBOSU")
    throw new ApiError(403, "Los bonos de clientes Cobosu se adquieren desde su aplicación. No se pueden añadir manualmente desde el panel.");
}
