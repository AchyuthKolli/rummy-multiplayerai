import type { ReactNode } from "react";
import { Toaster } from "sonner";

interface Props {
  children: ReactNode;
}

/**
 * A provider wrapping the whole app.
 *
 * You can add multiple providers here by nesting them,
 * and they will all be applied to the app.
 */
export const AppProvider = ({ children }: Props) => {
  return (
    <>
      {children}
      <Toaster richColors position="top-right" />
    </>
  );
};
