declare const Deno: {
  serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void;
  env: { get(key: string): string | undefined };
};

declare module "npm:@supabase/supabase-js@2" {
  export function createClient(
    url: string,
    key: string,
    options?: Record<string, unknown>,
  ): {
    auth: {
      admin: {
        generateLink(args: {
          type: string;
          email: string;
          password?: string;
          options?: { redirectTo?: string };
        }): Promise<{
          data: { properties?: { email_otp?: string; action_link?: string } };
          error: { message: string } | null;
        }>;
        createUser(args: {
          email: string;
          password: string;
          email_confirm?: boolean;
        }): Promise<{ error: { message: string } | null }>;
      };
    };
  };
}
