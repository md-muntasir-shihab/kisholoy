import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Creates the first admin user.
 *
 * Credentials come from the environment, never from argv: command line
 * arguments are readable by every user on the host through
 * `/proc/<pid>/cmdline` and they leak into shell history and CI logs.
 *
 *   ADMIN_EMAIL=ops@kisholoy.test \
 *   ADMIN_INITIAL_PASSWORD="$(openssl rand -base64 18)" \
 *     npm run create:admin
 *
 * The password is hashed with scrypt by the `emailpass` provider before it is
 * written, and it is never printed, returned or logged. There is deliberately
 * no HTTP endpoint that creates an admin from a request body.
 */
export default async function createAdmin({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const authService = container.resolve(Modules.AUTH)
  const workflowService = container.resolve(Modules.WORKFLOW_ENGINE)

  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_INITIAL_PASSWORD

  if (!email || !password) {
    throw new Error(
      "ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD must both be set. " +
        "Provide them through your secret store, never on the command line."
    )
  }

  if (password.length < 12) {
    throw new Error(
      "ADMIN_INITIAL_PASSWORD must be at least 12 characters long. " +
        "Generate one with: openssl rand -base64 18"
    )
  }

  const { result: users } = await workflowService.run("create-users-workflow", {
    input: { users: [{ email }] },
  })
  const user = users[0]

  const { authIdentity, error } = await authService.register("emailpass", {
    body: { email, password },
  })

  if (error) {
    throw new Error(
      `Admin creation failed for ${email}: ${
        (error as { message?: string }).message ?? "unknown error"
      }`
    )
  }

  await authService.updateAuthIdentities({
    id: authIdentity!.id,
    app_metadata: { user_id: user.id },
  })

  logger.info(
    `Admin account created for ${email}. Rotate this password after the first ` +
      `login (Settings > My Account); it is never stored in plain text.`
  )
}
