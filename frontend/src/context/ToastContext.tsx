import { createContext, useContext, useState, useCallback } from "react"

type ToastType = "success" | "error"

interface Toast {
    id: number
    message: string
    type: ToastType
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType>(null!)

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const showToast = useCallback((message: string, type: ToastType = "success") => {
        const id = Date.now() + Math.random()
        setToasts(prev => [...prev, { id, message, type }])
        setTimeout(() => dismiss(id), type === "error" ? 4000 : 2500)
    }, [dismiss])

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="toast_container">
                {toasts.map(t => (
                    <div
                        key={t.id}
                        className={`toast ${t.type === "error" ? "toast_error" : ""}`}
                        onClick={() => dismiss(t.id)}
                        role="status"
                    >
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext)
