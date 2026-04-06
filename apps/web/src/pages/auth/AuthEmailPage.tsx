import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Input } from "@okkey/ui";

import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";

export default function AuthEmailPage() {
  const [email, setEmail] = useState("");

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
  }

  return (
    <AppShellLayout
      title="Welcome to Okkey"
      description="Enter your email"
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6" noValidate>
        <div className="flex w-full flex-col gap-3">
          <label htmlFor="auth-email" className="okkey-small font-medium text-copy-primary">
            Email
          </label>
          <Input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="me@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" variant="default" className="w-full">
          Sign in
        </Button>
        <p className="text-center text-xs leading-4 text-copy-secondary">
          By clicking &quot;Sign in&quot;, you agree to our{" "}
          <Link
            to="/privacy"
            className="text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
          >
            Privacy policy
          </Link>
          .
        </p>
      </form>
    </AppShellLayout>
  );
}
