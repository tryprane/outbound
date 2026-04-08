import { PrismaAdapter } from '@auth/prisma-adapter'
import { Adapter } from 'next-auth/adapters'
import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma } from '@/lib/prisma'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase()
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    CredentialsProvider({
      name: 'Email and Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase()
        const password = credentials?.password

        if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
          console.error('[Auth] ADMIN_EMAIL or ADMIN_PASSWORD is not configured')
          return null
        }

        if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
          return null
        }

        const user = await prisma.user.upsert({
          where: { email },
          update: {
            name: 'Outreach Admin',
          },
          create: {
            email,
            name: 'Outreach Admin',
          },
        })

        return {
          id: user.id,
          name: user.name,
          email: user.email,
        }
      },
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async session({ session, token }: { session: any; token: any }) {
      const userId = (token?.id as string | undefined) ?? (token?.sub as string | undefined)

      if (userId) {
        session.user.id = userId

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true, image: true },
        })

        if (user) {
          session.user.name = user.name ?? session.user.name
          session.user.email = user.email ?? session.user.email
          session.user.image = user.image ?? null
        }
      }

      return session
    },
    async jwt({ token, user, account }) {
      // On first sign-in, persist user.id into the token (works for both
      // CredentialsProvider and GoogleProvider with PrismaAdapter + JWT strategy)
      if (user?.id) {
        token.id = user.id
      }
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
      }
      return token
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
}
