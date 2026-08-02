import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';
import { Inject, Injectable } from '@nestjs/common';
import configs from '../../../configs';
import _const from '../../../core/utils/const';
import logger from '../../../core/utils/winston.util';
import { IEmailService } from '../../../domain/services/iemail.service';

/**
 * One branded layout, many messages.
 *
 * Every transactional email — welcome, verification, password reset, two-factor
 * code, a new follower, the weekly digest, an invite, a payout — is the same
 * chrome with different content. Writing that chrome into ten HTML files is how
 * a product ends up with eight emails that look right and two that look like
 * 2009, so there is exactly one layout and the content is composed here.
 *
 * The layout is compiled once at construction. Handlebars compilation is not
 * free, and this runs on the request path for verification codes.
 */
@Injectable()
export class BrandedEmailService {
  private readonly layout: HandlebarsTemplateDelegate<LayoutContext>;

  constructor(
    @Inject(_const.IEMAIL_SERVICE)
    private readonly email: IEmailService,
  ) {
    this.layout = Handlebars.compile<LayoutContext>(this.loadLayout());
  }

  /**
   * The layout, read from `src/templates` in development and `dist/templates`
   * in production.
   *
   * `nest build` does not copy non-TS assets by default, so resolving relative
   * to `__dirname` alone fails in the container. Both roots are tried, and a
   * miss degrades to a minimal inline shell rather than taking the process
   * down — an unstyled password reset still resets a password.
   */
  private loadLayout(): string {
    const candidates = [
      path.join(__dirname, '../../../templates/email/layout.html'),
      path.join(process.cwd(), 'src/templates/email/layout.html'),
      path.join(process.cwd(), 'dist/templates/email/layout.html'),
    ];
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
      } catch {
        // Try the next candidate.
      }
    }
    logger.warn(
      '[branded-email] layout.html not found; falling back to a plain shell',
    );
    return FALLBACK_LAYOUT;
  }

  /** Render and send. Content is trusted HTML built by the helpers below. */
  public async sendAsync(input: {
    to: string;
    subject: string;
    preheader?: string;
    title: string;
    subtitle?: string;
    contentHtml: string;
    ctaUrl?: string;
    ctaLabel?: string;
    ctaFallbackNote?: string;
    footerNote?: string;
    unsubscribeUrl?: string;
    locale?: string;
  }): Promise<void> {
    const appUrl = (configs.frontend?.url ?? configs.app?.url ?? '').replace(
      /\/+$/,
      '',
    );
    const locale = input.locale ?? 'sv';

    const html = this.layout({
      subject: input.subject,
      preheader: input.preheader ?? input.subtitle ?? input.title,
      title: input.title,
      subtitle: input.subtitle,
      content: input.contentHtml,
      ctaUrl: input.ctaUrl,
      ctaLabel: input.ctaLabel ?? 'Open Gaddr',
      ctaFallbackNote: input.ctaUrl
        ? (input.ctaFallbackNote ??
          'If the button does not work, paste this into your browser:')
        : undefined,
      footerNote:
        input.footerNote ??
        'You can change what we email you in Settings → Notifications.',
      unsubscribeUrl: input.unsubscribeUrl,
      appUrl,
      productName: 'Community',
      locale,
      // Arabic and Hebrew are registered locales; the layout mirrors for them.
      direction: RTL_LOCALES.has(locale.split('-')[0]) ? 'rtl' : 'ltr',
    });

    await this.email.sendAsync({
      to: input.to,
      subject: input.subject,
      html,
    });
  }

  /* ------------------------------------------------------------- messages */

  public async sendWelcomeAsync(input: {
    to: string;
    displayName: string;
    handle: string;
    locale?: string;
  }): Promise<void> {
    const appUrl = this.appUrl();
    await this.sendAsync({
      to: input.to,
      locale: input.locale,
      subject: 'Welcome to Gaddr Community',
      preheader: 'Your profile is live. Here is how to make it yours.',
      title: `Welcome, ${escapeHtml(input.displayName)}`,
      subtitle: `You are @${escapeHtml(input.handle)} on Gaddr.`,
      contentHtml: [
        paragraph(
          'Community is where your work, your people and the brands you care about live in one feed. A few things worth doing first:',
        ),
        list([
          'Follow a few people — the feed learns from what you actually read, not from what you tell it.',
          'Post something. Text, a photo, a poll, a moment, a place, a product.',
          'Choose who sees what. Every post can be public, followers only, close friends, or brand partners.',
        ]),
        paragraph(
          'Two feeds, and the choice is yours every time: <strong>Recommended</strong> for what we think you will want, <strong>Latest</strong> for everything in order. You can tune the recommender yourself in Settings → Feed, all the way down to a plain following timeline.',
        ),
      ].join(''),
      ctaUrl: `${appUrl}/community`,
      ctaLabel: 'Open Community',
      footerNote:
        'You are getting this because you just created a Gaddr account.',
    });
  }

  public async sendVerificationCodeAsync(input: {
    to: string;
    code: string;
    expiresInMinutes: number;
    locale?: string;
  }): Promise<void> {
    await this.sendAsync({
      to: input.to,
      locale: input.locale,
      subject: `${input.code} is your Gaddr verification code`,
      preheader: `Expires in ${input.expiresInMinutes} minutes.`,
      title: 'Confirm it is you',
      subtitle: 'Enter this code to continue.',
      contentHtml: [
        codeBlock(input.code),
        paragraph(
          `This code expires in ${input.expiresInMinutes} minutes and can be used once.`,
        ),
        muted(
          'If you did not ask for this, you can ignore this email — nothing has changed on your account.',
        ),
      ].join(''),
      footerNote: 'For your security, never share this code with anyone.',
    });
  }

  public async sendPasswordResetAsync(input: {
    to: string;
    resetUrl: string;
    expiresInMinutes: number;
    requestContext?: { ip?: string; device?: string; location?: string };
    locale?: string;
  }): Promise<void> {
    await this.sendAsync({
      to: input.to,
      locale: input.locale,
      subject: 'Reset your Gaddr password',
      preheader: `This link expires in ${input.expiresInMinutes} minutes.`,
      title: 'Reset your password',
      subtitle: 'Use the button below to choose a new one.',
      contentHtml: [
        paragraph(
          `The link is valid for ${input.expiresInMinutes} minutes and can be used once.`,
        ),
        input.requestContext
          ? detailPanel('Where this came from', [
              ['Device', input.requestContext.device],
              ['Location', input.requestContext.location],
              ['IP address', input.requestContext.ip],
            ])
          : '',
        muted(
          'If you did not request this, ignore this email. Your password stays as it is, and the link expires on its own.',
        ),
      ].join(''),
      ctaUrl: input.resetUrl,
      ctaLabel: 'Choose a new password',
      footerNote: 'This link works once and expires shortly.',
    });
  }

  public async sendPasswordChangedAsync(input: {
    to: string;
    locale?: string;
  }): Promise<void> {
    await this.sendAsync({
      to: input.to,
      locale: input.locale,
      subject: 'Your Gaddr password was changed',
      title: 'Your password was changed',
      subtitle: 'If this was you, there is nothing to do.',
      contentHtml: [
        paragraph(
          'Every other session has been signed out as a precaution. You will need to sign in again on your other devices.',
        ),
        muted(
          'If this was not you, reset your password immediately and turn on two-factor sign-in in Settings → Security.',
        ),
      ].join(''),
      ctaUrl: `${this.appUrl()}/settings/security`,
      ctaLabel: 'Review security settings',
    });
  }

  /** The optional email second factor. */
  public async sendTwoFactorCodeAsync(input: {
    to: string;
    code: string;
    expiresInMinutes: number;
    device?: string;
    locale?: string;
  }): Promise<void> {
    await this.sendAsync({
      to: input.to,
      locale: input.locale,
      subject: `${input.code} — your Gaddr sign-in code`,
      preheader: 'Someone is signing in to your account.',
      title: 'Your sign-in code',
      subtitle: input.device
        ? `Requested from ${escapeHtml(input.device)}.`
        : undefined,
      contentHtml: [
        codeBlock(input.code),
        paragraph(`This code expires in ${input.expiresInMinutes} minutes.`),
        muted(
          'If you are not signing in right now, someone has your password. Change it, and keep two-factor on.',
        ),
      ].join(''),
      footerNote:
        'You can turn two-factor sign-in on or off in Settings → Security.',
    });
  }

  public async sendNotificationAsync(input: {
    to: string;
    title: string;
    body: string;
    actorName?: string;
    ctaUrl?: string;
    ctaLabel?: string;
    unsubscribeUrl?: string;
    locale?: string;
  }): Promise<void> {
    await this.sendAsync({
      to: input.to,
      locale: input.locale,
      subject: input.title,
      preheader: input.body,
      title: input.title,
      subtitle: input.actorName
        ? `From ${escapeHtml(input.actorName)}`
        : undefined,
      contentHtml: paragraph(escapeHtml(input.body)),
      ctaUrl: input.ctaUrl,
      ctaLabel: input.ctaLabel ?? 'View on Gaddr',
      unsubscribeUrl: input.unsubscribeUrl,
    });
  }

  /**
   * The periodic digest.
   *
   * Deliberately short: highlights, then a single link. A digest that tries to
   * reproduce the feed in an inbox is a worse feed and a worse inbox.
   */
  public async sendDigestAsync(input: {
    to: string;
    displayName: string;
    periodLabel: string;
    highlights: Array<{
      title: string;
      detail: string;
      url?: string;
    }>;
    stats?: { impressions: number; interactions: number; followers: number };
    unsubscribeUrl?: string;
    locale?: string;
  }): Promise<void> {
    const appUrl = this.appUrl();
    const items = input.highlights
      .slice(0, 6)
      .map((h) =>
        highlightRow(
          h.title,
          h.detail,
          h.url ? `${appUrl}${h.url}` : undefined,
        ),
      )
      .join('');

    await this.sendAsync({
      to: input.to,
      locale: input.locale,
      subject: `Your ${input.periodLabel} on Gaddr`,
      preheader: input.highlights[0]?.title ?? 'Here is what happened.',
      title: `Your ${input.periodLabel}`,
      subtitle: `Hello ${escapeHtml(input.displayName)} — here is what you missed.`,
      contentHtml: [
        input.stats
          ? statsRow([
              ['Impressions', formatCompact(input.stats.impressions)],
              ['Interactions', formatCompact(input.stats.interactions)],
              ['New followers', formatCompact(input.stats.followers)],
            ])
          : '',
        items || paragraph('It was quiet. A good week to post something.'),
      ].join(''),
      ctaUrl: `${appUrl}/community`,
      ctaLabel: 'Open Community',
      unsubscribeUrl: input.unsubscribeUrl,
      footerNote:
        'Digests can be switched off in Settings → Notifications without affecting anything else.',
    });
  }

  public async sendInviteAsync(input: {
    to: string;
    inviterName: string;
    inviteUrl: string;
    rewardLabel?: string;
    locale?: string;
  }): Promise<void> {
    await this.sendAsync({
      to: input.to,
      locale: input.locale,
      subject: `${input.inviterName} invited you to Gaddr`,
      preheader: 'Claim your invite.',
      title: `${escapeHtml(input.inviterName)} invited you`,
      subtitle:
        'Gaddr Community — one feed for your work, your people and the brands you follow.',
      contentHtml: [
        paragraph(
          'Your invite is ready. It takes about a minute to set up a profile, and you choose who sees what from the first post.',
        ),
        input.rewardLabel
          ? paragraph(
              `You both get ${escapeHtml(input.rewardLabel)} once your profile is set up.`,
            )
          : '',
      ].join(''),
      ctaUrl: input.inviteUrl,
      ctaLabel: 'Accept the invite',
      footerNote: 'If you do not know the sender, you can ignore this email.',
    });
  }

  private appUrl(): string {
    return (configs.frontend?.url ?? configs.app?.url ?? '').replace(
      /\/+$/,
      '',
    );
  }
}

/* --------------------------------------------------------------- fragments
 *
 * Small HTML builders rather than more templates. Each is inline-styled
 * because mail clients strip <style>, and each is used by several messages —
 * which is exactly the point.
 */

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";

export function paragraph(html: string): string {
  return `<p style="margin:0 0 16px 0;font-family:${FONT_STACK};font-size:15px;line-height:1.65;">${html}</p>`;
}

export function muted(html: string): string {
  return `<p class="gd-muted" style="margin:0 0 12px 0;font-family:${FONT_STACK};font-size:13px;line-height:1.6;color:#767676;">${html}</p>`;
}

export function list(items: string[]): string {
  const rows = items
    .map(
      (item) =>
        `<li style="margin:0 0 8px 0;line-height:1.6;">${escapeHtml(item)}</li>`,
    )
    .join('');
  return `<ul style="margin:0 0 18px 0;padding-left:20px;font-family:${FONT_STACK};font-size:15px;">${rows}</ul>`;
}

export function codeBlock(code: string): string {
  return `<div class="gd-panel" style="margin:8px 0 20px 0;padding:22px;background:#f4f1ff;border-radius:14px;text-align:center;font-family:${FONT_STACK};font-size:34px;font-weight:700;letter-spacing:10px;color:#512fb6;">${escapeHtml(
    code,
  )}</div>`;
}

export function detailPanel(
  heading: string,
  rows: Array<[string, string | undefined]>,
): string {
  const body = rows
    .filter(([, value]) => Boolean(value))
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#767676;font-size:13px;">${escapeHtml(
          label,
        )}</td><td style="padding:4px 0;font-size:13px;">${escapeHtml(
          value as string,
        )}</td></tr>`,
    )
    .join('');
  if (!body) return '';
  return `<div class="gd-panel" style="margin:0 0 18px 0;padding:16px 18px;background:#f7f6fb;border-radius:12px;font-family:${FONT_STACK};">
    <div style="font-size:12px;text-transform:uppercase;letter-spacing:1.1px;color:#767676;margin-bottom:8px;">${escapeHtml(
      heading,
    )}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">${body}</table>
  </div>`;
}

export function statsRow(stats: Array<[string, string]>): string {
  const cells = stats
    .map(
      ([label, value]) =>
        `<td align="center" style="padding:14px 8px;">
          <div style="font-size:22px;font-weight:700;color:#512fb6;">${escapeHtml(value)}</div>
          <div class="gd-muted" style="font-size:12px;color:#767676;margin-top:2px;">${escapeHtml(label)}</div>
        </td>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="gd-panel" style="margin:0 0 20px 0;background:#f7f6fb;border-radius:14px;font-family:${FONT_STACK};"><tr>${cells}</tr></table>`;
}

export function highlightRow(
  title: string,
  detail: string,
  url?: string,
): string {
  const heading = url
    ? `<a href="${escapeAttribute(url)}" style="color:#512fb6;text-decoration:none;font-weight:600;">${escapeHtml(title)}</a>`
    : `<span style="font-weight:600;">${escapeHtml(title)}</span>`;
  return `<div class="gd-divider" style="padding:14px 0;border-bottom:1px solid #ececf1;font-family:${FONT_STACK};">
    <div style="font-size:15px;line-height:1.4;">${heading}</div>
    <div class="gd-muted" style="font-size:13px;line-height:1.6;color:#767676;margin-top:4px;">${escapeHtml(detail)}</div>
  </div>`;
}

/** 12 345 → "12.3k". Keeps a digest's stat row from wrapping on mobile. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) < 1000) return String(Math.round(value));
  if (Math.abs(value) < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

/**
 * Escape text destined for HTML.
 *
 * Display names and post bodies reach these templates. An unescaped `<` in a
 * display name is an HTML injection into someone else's inbox, which is both a
 * phishing vector and a rendering bug.
 */
export function escapeHtml(value: string): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

const RTL_LOCALES = new Set(['ar', 'he', 'fa', 'ur']);

interface LayoutContext {
  subject: string;
  preheader: string;
  title: string;
  subtitle?: string;
  content: string;
  ctaUrl?: string;
  ctaLabel: string;
  ctaFallbackNote?: string;
  footerNote: string;
  unsubscribeUrl?: string;
  appUrl: string;
  productName: string;
  locale: string;
  direction: 'ltr' | 'rtl';
}

/** Last resort if the layout file is missing from the image. */
const FALLBACK_LAYOUT = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f4f8;padding:24px;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
<h1 style="color:#512fb6;">{{title}}</h1>
{{#if subtitle}}<p style="color:#595959;">{{subtitle}}</p>{{/if}}
{{{content}}}
{{#if ctaUrl}}<p><a href="{{ctaUrl}}" style="color:#512fb6;">{{ctaLabel}}</a></p>{{/if}}
<hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
<p style="font-size:12px;color:#767676;">{{footerNote}}</p>
</div></body></html>`;
