"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Error de autenticación");
        setLoading(false);
        return;
      }
      const from = params.get("from") || "/";
      router.push(from);
      router.refresh();
    } catch {
      setError("No se pudo conectar. Revisá tu conexión.");
      setLoading(false);
    }
  }

  return (
    <LoginShell>
      <form onSubmit={onSubmit} style={formStyle}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Usuario</label>
          <input
            type="text"
            autoFocus
            autoComplete="username"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            required
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Contraseña</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={inputStyle}
          />
        </div>

        {error && (
          <div style={errorStyle}>{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            ...buttonStyle,
            background: loading ? "#6A5C54" : "#1A1612",
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </LoginShell>
  );
}

function LoginShell({ children }: { children?: React.ReactNode }) {
  return (
    <main style={pageStyle}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={rxStyle}>
            Rx<sup style={{ fontSize: 16 }}>+</sup>
          </div>
          <h1 style={titleStyle}>La Dupla</h1>
          <div style={subtitleStyle}>Historia clínica del ecommerce</div>
        </div>

        {children}

        <div style={footerStyle}>Solo acceso autorizado</div>
      </div>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#F5EFE3",
  color: "#1A1612",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const rxStyle: React.CSSProperties = {
  fontFamily: '"Iowan Old Style", Georgia, serif',
  fontStyle: "italic",
  fontWeight: 500,
  fontSize: 34,
  color: "#A6121A",
  letterSpacing: "-0.02em",
  lineHeight: 1,
};

const titleStyle: React.CSSProperties = {
  fontFamily: '"Iowan Old Style", Georgia, serif',
  fontWeight: 500,
  fontStyle: "italic",
  fontSize: 28,
  margin: "12px 0 4px",
  letterSpacing: "-0.01em",
};

const subtitleStyle: React.CSSProperties = {
  color: "#6A5C54",
  fontSize: 13,
  fontStyle: "italic",
  fontFamily: '"Iowan Old Style", Georgia, serif',
};

const formStyle: React.CSSProperties = {
  background: "#FBF6EC",
  border: "1px solid #DED3BE",
  borderRadius: 6,
  padding: 28,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#6A5C54",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "inherit",
  background: "#FFFFFF",
  border: "1px solid #DED3BE",
  color: "#1A1612",
  borderRadius: 4,
  boxSizing: "border-box",
};

const errorStyle: React.CSSProperties = {
  background: "#EDD1CB",
  color: "#790C12",
  padding: "10px 12px",
  borderRadius: 4,
  fontSize: 13,
  marginBottom: 16,
};

const buttonStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  color: "#F5EFE3",
  border: "none",
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const footerStyle: React.CSSProperties = {
  textAlign: "center",
  marginTop: 20,
  fontSize: 11,
  color: "#6A5C54",
  fontStyle: "italic",
  fontFamily: '"Iowan Old Style", Georgia, serif',
};
