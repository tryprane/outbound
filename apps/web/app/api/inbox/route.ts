import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMailboxSyncQueue } from '@/lib/mailboxSyncQueue'
import { clearUnifiedInboxData, getUnifiedInboxRetention } from '@/lib/inboxCleanup'
import { markMailboxMessageAsRead, rescueMailboxMessageToInbox, replyToMailboxMessage } from '@/lib/mailboxActions'
import { getWhatsAppQueue } from '@/lib/whatsappQueue'

export const dynamic = 'force-dynamic'

function normalizeSearch(value: string | null) {
  return value?.trim() || ''
}

function normalizeFolderKind(value: string | null) {
  if (!value) return 'INBOX'
  if (['INBOX', 'SPAM', 'SENT', 'ARCHIVE', 'OTHER'].includes(value)) return value as 'INBOX' | 'SPAM' | 'SENT' | 'ARCHIVE' | 'OTHER'
  return 'INBOX'
}

function normalizeJidToPhone(jid: string) {
  return jid.replace(/@s\.whatsapp\.net$/i, '')
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const channel = searchParams.get('channel') === 'whatsapp' ? 'whatsapp' : 'email'
    const retention = await getUnifiedInboxRetention()

    if (channel === 'whatsapp') {
      const whatsappAccountId = searchParams.get('whatsappAccountId') || undefined
      const conversationId = searchParams.get('conversationId') || undefined
      const search = normalizeSearch(searchParams.get('search')).toLowerCase()

      const conversations = await prisma.whatsAppConversation.findMany({
        where: {
          ...(whatsappAccountId ? { whatsappAccountId } : {}),
          ...(search
            ? {
                OR: [
                  { participantPhone: { contains: search, mode: 'insensitive' } },
                  { participantName: { contains: search, mode: 'insensitive' } },
                  { messages: { some: { body: { contains: search, mode: 'insensitive' } } } },
                ],
              }
            : {}),
        },
        orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
        take: 200,
        select: {
          id: true,
          participantJid: true,
          participantPhone: true,
          participantName: true,
          lastMessageAt: true,
          whatsappAccountId: true,
          whatsappAccount: {
            select: {
              id: true,
              displayName: true,
              phoneNumber: true,
              connectionStatus: true,
              isActive: true,
            },
          },
          messages: {
            orderBy: [{ sentAt: 'desc' }, { receivedAt: 'desc' }, { createdAt: 'desc' }],
            take: 1,
            select: {
              id: true,
              direction: true,
              body: true,
              status: true,
              sentAt: true,
              receivedAt: true,
              createdAt: true,
            },
          },
        },
      })

      const selectedConversationId = conversationId || conversations[0]?.id
      const selectedConversation = selectedConversationId
        ? await prisma.whatsAppConversation.findUnique({
            where: { id: selectedConversationId },
            select: {
              id: true,
              participantJid: true,
              participantPhone: true,
              participantName: true,
              lastMessageAt: true,
              whatsappAccountId: true,
              whatsappAccount: {
                select: {
                  id: true,
                  displayName: true,
                  phoneNumber: true,
                  connectionStatus: true,
                  isActive: true,
                },
              },
              messages: {
                orderBy: [{ sentAt: 'asc' }, { receivedAt: 'asc' }, { createdAt: 'asc' }],
                take: 300,
                select: {
                  id: true,
                  direction: true,
                  body: true,
                  status: true,
                  sentAt: true,
                  receivedAt: true,
                  createdAt: true,
                },
              },
            },
          })
        : null

      return NextResponse.json({
        channel,
        retention,
        conversations: conversations.map((conversation) => ({
          ...conversation,
          lastMessage: conversation.messages[0] || null,
        })),
        selectedConversation,
      })
    }

    const folderKind = normalizeFolderKind(searchParams.get('folderKind'))
    const mailAccountId = searchParams.get('mailAccountId') || undefined
    const includeWarmup = searchParams.get('includeWarmup') === 'true'
    const search = normalizeSearch(searchParams.get('search'))

    const messages = await prisma.mailboxMessage.findMany({
      where: {
        folderKind,
        ...(mailAccountId ? { mailAccountId } : {}),
        ...(includeWarmup ? {} : { isWarmup: false }),
        ...(search
          ? {
              OR: [
                { subject: { contains: search, mode: 'insensitive' } },
                { snippet: { contains: search, mode: 'insensitive' } },
                { fromEmail: { contains: search, mode: 'insensitive' } },
                { toEmail: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ receivedAt: 'desc' }, { sentAt: 'desc' }, { createdAt: 'desc' }],
      take: 250,
      select: {
        id: true,
        mailAccountId: true,
        providerMessageId: true,
        providerThreadId: true,
        folderKind: true,
        folderName: true,
        direction: true,
        fromEmail: true,
        toEmail: true,
        subject: true,
        snippet: true,
        sentAt: true,
        receivedAt: true,
        isWarmup: true,
        isRead: true,
        isStarred: true,
        isSpam: true,
        openedAt: true,
        repliedAt: true,
        rescuedAt: true,
        createdAt: true,
        mailAccount: {
          select: {
            id: true,
            email: true,
            displayName: true,
            type: true,
          },
        },
      },
    })

    return NextResponse.json({
      channel,
      retention,
      messages,
    })
  } catch (error) {
    console.error('[Inbox GET]', error)
    return NextResponse.json({ error: 'Failed to load inbox data' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as
      | {
          channel: 'email'
          mailAccountId: string
          mailboxMessageId: string
          action: 'mark-read' | 'rescue-to-inbox' | 'reply'
          subject?: string
          html?: string
        }
      | {
          channel: 'whatsapp'
          conversationId: string
          body: string
        }

    if (body.channel === 'whatsapp') {
      const messageBody = body.body?.trim()
      if (!body.conversationId || !messageBody) {
        return NextResponse.json({ error: 'conversationId and body are required' }, { status: 400 })
      }

      const conversation = await prisma.whatsAppConversation.findUnique({
        where: { id: body.conversationId },
        include: {
          whatsappAccount: {
            select: {
              id: true,
              sessionKey: true,
              isActive: true,
              connectionStatus: true,
            },
          },
        },
      })

      if (!conversation) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }

      if (!conversation.whatsappAccount.isActive || conversation.whatsappAccount.connectionStatus !== 'CONNECTED') {
        return NextResponse.json({ error: 'WhatsApp account is not connected' }, { status: 400 })
      }

      await getWhatsAppQueue().add(
        'send-whatsapp' as never,
        {
          campaignId: null,
          csvRowId: null,
          whatsappAccountId: conversation.whatsappAccount.id,
          toPhone: conversation.participantPhone || normalizeJidToPhone(conversation.participantJid),
          message: messageBody,
        } as never,
        {
          jobId: `inbox-whatsapp-reply-${conversation.id}-${Date.now()}`,
        }
      )
      return NextResponse.json({ success: true })
    }

    if (!body.mailAccountId || !body.mailboxMessageId || !body.action) {
      return NextResponse.json({ error: 'mailAccountId, mailboxMessageId, and action are required' }, { status: 400 })
    }

    const [account, message] = await Promise.all([
      prisma.mailAccount.findUnique({ where: { id: body.mailAccountId } }),
      prisma.mailboxMessage.findUnique({ where: { id: body.mailboxMessageId } }),
    ])

    if (!account || !message || message.mailAccountId !== body.mailAccountId) {
      return NextResponse.json({ error: 'Mailbox message not found' }, { status: 404 })
    }

    const messageRef = {
      providerMessageId: message.providerMessageId,
      providerThreadId: message.providerThreadId,
      fromEmail: message.fromEmail,
      toEmail: message.toEmail,
      subject: message.subject,
      messageIdHeader: message.messageIdHeader,
      referencesHeader: message.referencesHeader,
      metadata: (message.metadata as Record<string, unknown> | null) ?? null,
    }

    if (body.action === 'mark-read') {
      await markMailboxMessageAsRead(account, messageRef)
      await prisma.mailboxMessage.update({
        where: { id: message.id },
        data: {
          isRead: true,
          openedAt: message.openedAt ?? new Date(),
        },
      })
      return NextResponse.json({ success: true })
    }

    if (body.action === 'rescue-to-inbox') {
      await rescueMailboxMessageToInbox(account, messageRef)
      await prisma.mailboxMessage.update({
        where: { id: message.id },
        data: {
          isRead: true,
          isSpam: false,
          folderKind: 'INBOX',
          folderName: 'Inbox',
          rescuedAt: new Date(),
          openedAt: message.openedAt ?? new Date(),
        },
      })
      await getMailboxSyncQueue().add(
        'sync-mailbox' as never,
        { mailAccountId: account.id, reason: 'manual' } as never,
        { jobId: `mailbox-rescue-refresh-${account.id}-${Date.now()}` }
      )
      return NextResponse.json({ success: true })
    }

    const subject =
      body.subject?.trim() ||
      (message.subject?.trim().startsWith('Re:') ? message.subject : `Re: ${message.subject || 'Quick follow-up'}`)
    const html = body.html?.trim()
    if (!html) {
      return NextResponse.json({ error: 'Reply body is required' }, { status: 400 })
    }

    await replyToMailboxMessage(account, messageRef, { subject, html })
    await prisma.mailboxMessage.update({
      where: { id: message.id },
      data: {
        repliedAt: new Date(),
        isRead: true,
        openedAt: message.openedAt ?? new Date(),
      },
    })
    await getMailboxSyncQueue().add(
      'sync-mailbox' as never,
      { mailAccountId: account.id, reason: 'manual' } as never,
      { jobId: `mailbox-reply-refresh-${account.id}-${Date.now()}` }
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Inbox PATCH]', error)
    return NextResponse.json({ error: 'Failed to update inbox item' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const scopeParam = request.nextUrl.searchParams.get('scope')
    const scope = scopeParam === 'email' || scopeParam === 'whatsapp' ? scopeParam : 'all'
    const results = await clearUnifiedInboxData(scope)
    return NextResponse.json({ success: true, scope, results })
  } catch (error) {
    console.error('[Inbox DELETE]', error)
    return NextResponse.json({ error: 'Failed to clear synced inbox data' }, { status: 500 })
  }
}
