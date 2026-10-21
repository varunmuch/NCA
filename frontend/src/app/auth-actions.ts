"use server";

import { AuthError, CredentialsSignin } from "next-auth";

import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import {
  callAuthBridge,
  getBridgeErrorMessage,
} from "@/lib/cie-server";
import { isRateLimited } from "@/lib/rate-limit";


export type AuthFormState = {
  error?: string;
  name?: string;
  email?: string;
  done?: boolean;
};


const MIN_PASSWORD_LENGTH = 8;


function readField(
  formData: FormData,
  key: string
) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}


function getSignInErrorMessage(
  error: AuthError
) {
  if (
    error instanceof CredentialsSignin &&
    error.code === "locked"
  ) {
    return "Too many wrong passwords. Please wait 15 minutes and try again.";
  }

  if (error.type === "CredentialsSignin") {
    return "That email and password don't match. Please try again.";
  }

  return "Something went wrong while signing in. Please try again.";
}


export async function signInWithGoogle() {
  await signIn(
    "google",
    {
      redirectTo: "/",
    }
  );
}


export async function signInWithPassword(
  _previous: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = readField(formData, "email").trim().toLowerCase();
  const password = readField(formData, "password");

  if (!email || !password) {
    return {
      email,
      error: "Please enter your email and password.",
    };
  }

  if (await isRateLimited("login")) {
    return {
      email,
      error: "Too many sign-in attempts. Please wait a few minutes and try again.",
    };
  }

  try {
    await signIn(
      "password",
      {
        email,
        password,
        redirectTo: "/",
      }
    );
  } catch (error) {
    // A successful sign-in throws a redirect, which must propagate.
    if (error instanceof AuthError) {
      return {
        email,
        error: getSignInErrorMessage(error),
      };
    }

    throw error;
  }

  return {};
}


export async function signUpWithPassword(
  _previous: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const name = readField(formData, "name").trim();
  const email = readField(formData, "email").trim().toLowerCase();
  const password = readField(formData, "password");
  const confirmPassword = readField(formData, "confirmPassword");

  const keep = {
    name,
    email,
  };

  if (!name) {
    return { ...keep, error: "Please enter your name." };
  }

  if (!email) {
    return { ...keep, error: "Please enter your email." };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ...keep,
      error: `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (password !== confirmPassword) {
    return { ...keep, error: "The two passwords don't match." };
  }

  if (await isRateLimited("signup")) {
    return { ...keep, error: "Too many attempts. Please wait a few minutes and try again." };
  }

  try {
    const result = await callAuthBridge(
      "/api/v1/auth/password/signup",
      {
        name,
        email,
        password,
      }
    );

    if (!result.ok) {
      return {
        ...keep,
        error: getBridgeErrorMessage(
          result.data,
          "We couldn't create your account. Please try again."
        ),
      };
    }
  } catch (error) {
    console.error("Unable to contact Career API:", error);

    return {
      ...keep,
      error: "We couldn't reach the server. Please try again in a moment.",
    };
  }

  try {
    await signIn(
      "password",
      {
        email,
        password,
        redirectTo: "/",
      }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        ...keep,
        error: "Your account was created! Please sign in.",
      };
    }

    throw error;
  }

  return {};
}


/**
 * Connect a verified Google sign-in to the existing password account with
 * the same email. The Google identity comes from the session, never the form.
 */
export async function linkGoogleWithPassword(
  _previous: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const session = await auth();
  const user = session?.user;

  if (
    user?.provider !== "google" ||
    !user.providerSubject ||
    !user.email ||
    user.googleEmailVerified !== true
  ) {
    redirect("/login");
  }

  const password = readField(formData, "password");

  if (!password) {
    return { error: "Please enter your password." };
  }

  if (await isRateLimited("link")) {
    return { error: "Too many attempts. Please wait a few minutes and try again." };
  }

  let result;

  try {
    result = await callAuthBridge("/api/v1/auth/google/link-password", {
      provider_subject: user.providerSubject,
      email: user.email.trim().toLowerCase(),
      name: user.name?.trim() || "",
      password,
    });
  } catch (error) {
    console.error("Unable to contact Career API:", error);
    return { error: "We couldn't reach the server. Please try again in a moment." };
  }

  if (!result.ok) {
    return {
      error:
        result.status === 401
          ? "That password doesn't match this account. Please try again."
          : getBridgeErrorMessage(result.data, "We couldn't connect your accounts. Please try again."),
    };
  }

  redirect("/");
}


export async function requestPasswordReset(
  _previous: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = readField(formData, "email").trim().toLowerCase();

  if (!email) {
    return { error: "Please enter your email." };
  }

  if (await isRateLimited("reset")) {
    return { email, error: "Too many requests. Please wait a few minutes and try again." };
  }

  try {
    await callAuthBridge("/api/v1/auth/password/forgot", { email });
  } catch (error) {
    console.error("Unable to contact Career API:", error);
    return { email, error: "We couldn't reach the server. Please try again in a moment." };
  }

  // Same answer whether or not the account exists.
  return { email, done: true };
}

export async function resetPassword(
  _previous: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const token = readField(formData, "token");
  const password = readField(formData, "password");
  const confirmPassword = readField(formData, "confirmPassword");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Your password needs at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  if (password !== confirmPassword) {
    return { error: "The two passwords don't match." };
  }

  if (await isRateLimited("reset")) {
    return { error: "Too many requests. Please wait a few minutes and try again." };
  }

  let result;

  try {
    result = await callAuthBridge<{ email?: string }>("/api/v1/auth/password/reset", { token, password });
  } catch (error) {
    console.error("Unable to contact Career API:", error);
    return { error: "We couldn't reach the server. Please try again in a moment." };
  }

  if (!result.ok) {
    return {
      error: getBridgeErrorMessage(result.data, "We couldn't reset your password. Please request a new link."),
    };
  }

  try {
    await signIn("password", { email: result.data.email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?reset=1");
    }

    throw error;
  }

  return {};
}
