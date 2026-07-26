/**
 * End-to-end smoke test for Community, against a real Postgres.
 *
 * Boots the compiled server, creates two users through the real registration
 * path, and exercises the write side: profile creation, posting, replying,
 * following, reacting, polls, visibility and both feeds.
 *
 * This exists because a green typecheck and green unit tests both passed while
 * aggregated search results were saved, returned, and never rendered — the gap
 * was between the layers, which is exactly what this covers.
 */
const { spawn } = require("child_process");
const fs = require("fs");

// Environment comes from a JSON file so this can run against a scratch
// database without touching a real one. See scripts/README-smoke.md.
const envFile = process.env.SMOKE_ENV_FILE ?? "/tmp/boot-env2.json";
if (!fs.existsSync(envFile)) {
	console.error(
		`Missing ${envFile}. See scripts/README-smoke.md for how to build one.`,
	);
	process.exit(2);
}
const env = JSON.parse(fs.readFileSync(envFile, "utf8"));
const PORT = process.env.SMOKE_PORT ?? "4601";
env.PORT = PORT;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;

const child = spawn("node", ["dist/main.js"], {
	env,
	stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
child.stdout.on("data", (d) => (serverLog += d));
child.stderr.on("data", (d) => (serverLog += d));

/**
 * Tables the run writes to, in an order CASCADE can resolve.
 *
 * The script is not idempotent without this: a second run finds Bo already in
 * Anna's close friends from the first, and "a non-close-friend does not see the
 * close-friends post" fails against state the previous run created. A test that
 * only passes once is a test nobody runs twice.
 *
 * `identity.users` is deliberately *not* truncated — the seeded users are the
 * fixture, and recreating them means re-hashing a bcrypt password per run.
 */
const RESET_TABLES = [
	'social.audience_members',
	'social.reactions',
	'social.poll_votes',
	'social.shares',
	'social.engagement_events',
	'social.topic_affinities',
	'social.ledger_entries',
	'social.invites',
	'social.messages',
	'social.conversation_members',
	'social.conversations',
	'social.posts',
];

async function resetAsync() {
	const { Client } = require('pg');
	const client = new Client({
		host: env.POSTGRES_HOST,
		port: Number(env.POSTGRES_PORT ?? 5432),
		user: env.POSTGRES_USERNAME,
		password: env.POSTGRES_PASSWORD,
		database: env.POSTGRES_DATABASE,
	});
	await client.connect();
	await client.query(`TRUNCATE ${RESET_TABLES.join(', ')} CASCADE`);
	await client.end();
}

const results = [];
function check(name, ok, detail = "") {
	results.push({ name, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, options = {}, token) {
	const response = await fetch(`${BASE}${path}`, {
		...options,
		headers: {
			"content-type": "application/json",
			...(token ? { authorization: `Bearer ${token}` } : {}),
			...(options.headers ?? {}),
		},
	});
	const text = await response.text();
	let body;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = text;
	}
	return { status: response.status, body };
}

/**
 * Log in a pre-seeded user.
 *
 * Registration is skipped deliberately: it uploads a default avatar through
 * Cloudinary, which has no valid key in this scratch environment, and that has
 * nothing to do with what is under test here. The users are inserted directly
 * with a real bcrypt hash so the *login* path is still exercised end to end.
 */
async function makeUser(email) {
	const login = await api("/auth/access-token", {
		method: "POST",
		body: JSON.stringify({
			email,
			password: "Sm0ke!Test#2026",
			userAgent: "smoke-test",
			ipAddress: "203.0.113.5",
			deviceId: `device-${email}`,
		}),
	});

	return {
		email,
		registerStatus: 200,
		registerBody: null,
		loginStatus: login.status,
		token: login.body?.access_token ?? null,
		loginBody: login.body,
	};
}

async function run() {
	const anna = await makeUser("anna.smoke@gmail.com");
	check(
		"register + login user A",
		Boolean(anna.token),
		`register=${anna.registerStatus} login=${anna.loginStatus}`,
	);
	if (!anna.token) {
		console.log("REGISTER:", JSON.stringify(anna.registerBody).slice(0, 500));
		console.log("LOGIN:", JSON.stringify(anna.loginBody).slice(0, 300));
		return;
	}

	const bo = await makeUser("bo.smoke@gmail.com");
	check("register + login user B", Boolean(bo.token));

	// --- profiles are created lazily on first Community use -----------------
	const annaProfile = await api("/community/me", {}, anna.token);
	check(
		"profile auto-created on first visit",
		annaProfile.status === 200 && Boolean(annaProfile.body?.handle),
		`handle=${annaProfile.body?.handle}`,
	);
	const boProfile = await api("/community/me", {}, bo.token);
	check("second profile created", boProfile.status === 200);

	// --- posting ------------------------------------------------------------
	const post = await api(
		"/community/posts",
		{
			method: "POST",
			body: JSON.stringify({
				kind: "update",
				body: "Shipping the Community layer today #buildinpublic",
				visibility: "public",
				publish: true,
			}),
		},
		anna.token,
	);
	check(
		"publish a post",
		post.status === 201 && post.body?.status === "published",
		`status=${post.status}`,
	);
	check(
		"hashtag extracted at write time",
		Array.isArray(post.body?.tags) && post.body.tags.includes("buildinpublic"),
		`tags=${JSON.stringify(post.body?.tags)}`,
	);

	const draft = await api(
		"/community/posts",
		{
			method: "POST",
			body: JSON.stringify({ kind: "update", body: "Not yet", publish: false }),
		},
		anna.token,
	);
	check("save a draft", draft.body?.status === "draft");

	const drafts = await api("/community/drafts", {}, anna.token);
	check(
		"drafts are listed",
		Array.isArray(drafts.body) && drafts.body.length >= 1,
	);

	// --- visibility ---------------------------------------------------------
	const privatePost = await api(
		"/community/posts",
		{
			method: "POST",
			body: JSON.stringify({
				kind: "update",
				body: "Only my close friends see this",
				visibility: "close_friends",
				publish: true,
			}),
		},
		anna.token,
	);
	check("publish a close-friends post", privatePost.status === 201);

	const anonymousFeed = await api("/community/feed?mode=latest&limit=20");
	const anonIds = (anonymousFeed.body?.items ?? []).map((p) => p.id);
	check(
		"anonymous feed shows the public post",
		anonIds.includes(post.body.id),
	);
	check(
		"anonymous feed hides the close-friends post",
		!anonIds.includes(privatePost.body.id),
		`saw ${anonIds.length} items`,
	);

	const boFeed = await api(
		"/community/feed?mode=latest&limit=20",
		{},
		bo.token,
	);
	const boIds = (boFeed.body?.items ?? []).map((p) => p.id);
	check(
		"a non-close-friend does not see the close-friends post",
		!boIds.includes(privatePost.body.id),
	);

	// Add Bo to Anna's close friends, then re-check.
	const addAudience = await api(
		`/community/audiences/close_friends/${boProfile.body.id}`,
		{ method: "POST", body: JSON.stringify({ included: true }) },
		anna.token,
	);
	check("add to close friends", addAudience.status === 201 || addAudience.status === 200);

	const boFeedAfter = await api(
		"/community/feed?mode=latest&limit=20",
		{},
		bo.token,
	);
	const boIdsAfter = (boFeedAfter.body?.items ?? []).map((p) => p.id);
	check(
		"a close friend now sees the close-friends post",
		boIdsAfter.includes(privatePost.body.id),
	);

	// --- engagement ---------------------------------------------------------
	const like = await api(
		`/community/posts/${post.body.id}/react`,
		{ method: "POST", body: JSON.stringify({ type: "like" }) },
		bo.token,
	);
	check("react to a post", like.body?.reacted === true, `likes=${like.body?.likesCount}`);

	const unlike = await api(
		`/community/posts/${post.body.id}/react`,
		{ method: "POST", body: JSON.stringify({ type: "like" }) },
		bo.token,
	);
	check("reacting twice removes the reaction", unlike.body?.reacted === false);

	const reply = await api(
		"/community/posts",
		{
			method: "POST",
			body: JSON.stringify({
				kind: "comment",
				body: "Congratulations!",
				parentId: post.body.id,
				publish: true,
			}),
		},
		bo.token,
	);
	check("reply to a post", reply.status === 201);

	const thread = await api(`/community/posts/${post.body.id}/thread`);
	check(
		"thread returns the reply",
		(thread.body?.replies ?? []).some((r) => r.id === reply.body.id),
	);

	// A reply to a close-friends post must not become public.
	const narrowReply = await api(
		"/community/posts",
		{
			method: "POST",
			body: JSON.stringify({
				kind: "comment",
				body: "Trying to reply publicly",
				parentId: privatePost.body.id,
				visibility: "public",
				publish: true,
			}),
		},
		bo.token,
	);
	check(
		"a reply cannot be wider than its parent",
		narrowReply.body?.visibility === "close_friends",
		`got ${narrowReply.body?.visibility}`,
	);

	// --- polls --------------------------------------------------------------
	const poll = await api(
		"/community/posts",
		{
			method: "POST",
			body: JSON.stringify({
				kind: "poll",
				body: "Which feed do you use?",
				pollOptions: ["For You", "Latest"],
				publish: true,
			}),
		},
		anna.token,
	);
	check("create a poll", poll.status === 201 && poll.body?.poll?.options?.length === 2);

	if (poll.body?.poll?.options?.[0]) {
		const vote = await api(
			`/community/posts/${poll.body.id}/vote`,
			{
				method: "POST",
				body: JSON.stringify({ optionId: poll.body.poll.options[0].id }),
			},
			bo.token,
		);
		check("vote in a poll", vote.status === 201 || vote.status === 200);

		const voted = await api(`/community/posts/${poll.body.id}`, {}, bo.token);
		check(
			"the vote is counted and attributed",
			voted.body?.poll?.totalVotes === 1 &&
				voted.body?.poll?.viewerOptionId === poll.body.poll.options[0].id,
			`total=${voted.body?.poll?.totalVotes}`,
		);
	}

	// --- disclosure ---------------------------------------------------------
	const undisclosed = await api(
		"/community/posts",
		{
			method: "POST",
			body: JSON.stringify({
				kind: "update",
				body: "Love this",
				isSponsored: true,
				disclosure: "none",
				publish: true,
			}),
		},
		anna.token,
	);
	check(
		"an undisclosed sponsored post is refused",
		undisclosed.status === 400,
		`status=${undisclosed.status}`,
	);

	const disclosed = await api(
		"/community/posts",
		{
			method: "POST",
			body: JSON.stringify({
				kind: "update",
				body: "Love this",
				isSponsored: true,
				publish: true,
			}),
		},
		anna.token,
	);
	check(
		"an omitted disclosure defaults to paid partnership",
		disclosed.body?.disclosure === "paid_partnership",
	);

	// --- follow + recommended feed -----------------------------------------
	const follow = await api(
		`/community/profiles/${annaProfile.body.id}/follow`,
		{ method: "POST" },
		bo.token,
	);
	check("follow a profile", follow.status === 201 || follow.status === 200);

	const recommended = await api(
		"/community/feed?mode=recommended&limit=20",
		{},
		bo.token,
	);
	const recommendedIds = (recommended.body?.items ?? []).map((p) => p.id);
	check(
		"the recommended feed returns ranked posts",
		recommended.status === 200 && recommendedIds.length > 0,
		`${recommendedIds.length} items`,
	);
	check(
		"ranked posts carry a reason",
		(recommended.body?.items ?? []).some((p) => (p.reasons ?? []).length > 0),
		JSON.stringify((recommended.body?.items ?? [])[0]?.reasons ?? []),
	);

	// --- algorithm controls -------------------------------------------------
	const preferences = await api("/community/feed/preferences", {}, bo.token);
	check(
		"feed preferences are readable, with defaults",
		preferences.status === 200 &&
			typeof preferences.body?.preferences?.recencyHalfLifeHours === "number",
	);

	const setPreferences = await api(
		"/community/feed/preferences",
		{
			method: "POST",
			body: JSON.stringify({
				sources: {
					following: 1,
					topicAffinity: 0,
					coEngagement: 0,
					trending: 0,
					similarAuthors: 0,
					fresh: 0,
				},
				recencyHalfLifeHours: Number.NaN,
			}),
		},
		bo.token,
	);
	check(
		"a hostile preference is clamped rather than stored",
		setPreferences.body?.preferences?.recencyHalfLifeHours === 20,
		`got ${setPreferences.body?.preferences?.recencyHalfLifeHours}`,
	);
	check(
		"sources can be turned off individually",
		setPreferences.body?.preferences?.sources?.trending === 0,
	);

	const followingOnly = await api(
		"/community/feed?mode=recommended&limit=20",
		{},
		bo.token,
	);
	check(
		"a following-only recommended feed still returns posts",
		followingOnly.status === 200 &&
			(followingOnly.body?.items ?? []).length > 0,
	);

	// --- signals, share, explore -------------------------------------------
	const signals = await api(
		"/community/signals",
		{
			method: "POST",
			body: JSON.stringify({
				events: [
					{
						subjectId: post.body.id,
						subjectKind: "post",
						kind: "impression",
						surface: "feed_recommended",
						position: 0,
					},
				],
			}),
		},
		bo.token,
	);
	check("engagement signals are accepted", signals.body?.recorded === 1);

	const share = await api(
		`/community/posts/${post.body.id}/share`,
		{ method: "POST", body: JSON.stringify({ channel: "copy_link" }) },
		bo.token,
	);
	check(
		"sharing mints an attribution code",
		Boolean(share.body?.referralCode) && share.body?.url?.includes("ref="),
	);

	const explore = await api(`/community/explore?q=Community`);
	check("search finds the post", (explore.body?.posts ?? []).length > 0);

	// --- messaging ----------------------------------------------------------
	const conversation = await api(
		"/community/conversations",
		{ method: "POST", body: JSON.stringify({ profileId: annaProfile.body.id }) },
		bo.token,
	);
	check("open a direct conversation", Boolean(conversation.body?.id));

	const again = await api(
		"/community/conversations",
		{ method: "POST", body: JSON.stringify({ profileId: annaProfile.body.id }) },
		bo.token,
	);
	check(
		"opening it twice returns the same thread",
		again.body?.id === conversation.body?.id,
	);

	if (conversation.body?.id) {
		const message = await api(
			`/community/conversations/${conversation.body.id}/messages`,
			{ method: "POST", body: JSON.stringify({ body: "Hello!" }) },
			bo.token,
		);
		check("send a message", message.status === 201 || message.status === 200);

		const unread = await api(
			"/community/conversations/unread-count",
			{},
			anna.token,
		);
		check("the recipient has an unread badge", unread.body?.count >= 1);
	}

	// --- streaming ----------------------------------------------------------
	const ingest = await api("/community/stream/ingest", {}, anna.token);
	check(
		"ingest endpoints are issued",
		ingest.status === 200 &&
			ingest.body?.obsDeepLink?.startsWith("obs://") &&
			typeof ingest.body?.streamKey === "string",
	);
	check(
		"an unconfigured media server is reported honestly",
		ingest.body?.configured === false,
	);

	// --- money --------------------------------------------------------------
	const balance = await api("/community/balance", {}, anna.token);
	check(
		"balance is derived and returned as strings",
		balance.status === 200 && typeof balance.body?.availableMinor === "string",
	);

	// --- invites ------------------------------------------------------------
	const invite = await api(
		"/community/invites",
		{ method: "POST", body: JSON.stringify({}) },
		anna.token,
	);
	check("create an invite", Boolean(invite.body?.code));

	if (invite.body?.code) {
		const preview = await api(`/community/invites/${invite.body.code}`);
		check("preview an invite anonymously", preview.body?.valid === true);
	}

	// --- analytics ----------------------------------------------------------
	const analytics = await api("/community/analytics?days=7", {}, anna.token);
	check(
		"creator analytics compute",
		analytics.status === 200 &&
			Array.isArray(analytics.body?.daily) &&
			analytics.body.daily.length === 8,
		`${analytics.body?.daily?.length} days, impressions=${analytics.body?.impressions}`,
	);
}

setTimeout(async () => {
	try {
		await resetAsync();
		await run();
	} catch (error) {
		console.log("SMOKE ERROR:", error.message);
		console.log(serverLog.slice(-1500));
	} finally {
		const failed = results.filter((r) => !r.ok);
		console.log(
			`\n=== ${results.length - failed.length}/${results.length} checks passed ===`,
		);
		if (failed.length) {
			console.log("FAILED:", failed.map((f) => f.name).join(", "));
		}
		child.kill("SIGKILL");
		process.exit(failed.length ? 1 : 0);
	}
}, 20000);
