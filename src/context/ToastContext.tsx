import React from "react";
import { Snackbar, Alert, AlertColor, Slide, SlideProps } from "@mui/material";

interface Toast {
  id: number;
  message: string;
  severity: AlertColor;
}

interface ToastContextValue {
  toast: (message: string, severity?: AlertColor) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = React.createContext<ToastContextValue>({
  toast: () => undefined,
  success: () => undefined,
  error: () => undefined,
  info: () => undefined,
});

export const useToast = () => React.useContext(ToastContext);

function SlideUp(props: SlideProps) {
  return <Slide {...props} direction="up" />;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = React.useState<Toast[]>([]);
  const counter = React.useRef(0);

  const toast = React.useCallback((message: string, severity: AlertColor = "info") => {
    counter.current += 1;
    const entry = { id: counter.current, message, severity };
    setQueue((prev) => [...prev.slice(-2), entry]);
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message: string) => toast(message, "success"),
      error: (message: string) => toast(message, "error"),
      info: (message: string) => toast(message, "info"),
    }),
    [toast]
  );

  const current = queue[0];

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        key={current?.id}
        open={!!current}
        autoHideDuration={4500}
        onClose={() => setQueue((prev) => prev.slice(1))}
        TransitionComponent={SlideUp}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={{ bottom: { xs: 84, sm: 24 } }}
      >
        {current ? (
          <Alert
            severity={current.severity}
            variant="filled"
            onClose={() => setQueue((prev) => prev.slice(1))}
            sx={{ borderRadius: 3, boxShadow: 6, minWidth: 260 }}
          >
            {current.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  );
}
