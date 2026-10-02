const token = process.env.DISCORD_BOT_TOKEN;
const guildId = '1172639313649995777';
if (!token) {
  console.error('missing token');
  process.exit(1);
}

const ROLE_NAMES = {
  '1203207583549227008': 'founder',
  '1389654736986181682': 'Owner',
  '1522611140209934336': 'Commissioner',
  '1172646210193068092': 'Admin',
  '1540591193254133841': 'Discord Manager',
  '1482871073153355806': 'Bot',
  '1451882174847389796': 'Manager',
  '1452047523299463228': 'Europe Head Admin',
  '1452047318772875346': 'North America Head Admin',
  '1482495287099654185': 'Asia Head Admin',
  '1532913859638198424': 'Australia Head Admin',
  '1532913970497720562': 'South America Head Admin',
  '1263277692887892060': 'Moderator',
  '1444855433624944790': 'Dev',
  '1533649254890082346': 'Bball Admin',
  '1323325081316757584': 'Content Creator',
  '1449421498556223548': 'Vscript',
  '1201274507277652019': 'Caster',
  '1448184242935824426': 'Map creator',
  '1172921417382244382': 'MGER',
  '1534360618948104212': 'BBALLER',
  '1422000591806398515': 'Ticket Tool',
  '1217718053144367117': 'Robot',
  '1256372759156752495': 'NA',
  '1173658382981402644': 'EU',
  '1173688881015685152': 'SA',
  '1257774438326210581': 'RU',
  '1265730618491277382': 'ASIA',
  '1398022051893219388': 'AUS',
  '1228919372287049792': 'Embed Generator',
  '1238917411298873354': '1v1',
  '1245760024614142044': '2v2',
  '1372307983178010686': 'Server Booster',
  '1530778788252745780': '[LAN] World Champion',
  '1399240120111992894': '[NA] 1v1 Champion 2025',
  '1442633204036141201': '[EU] Season 2 Champion',
  '1397325814512746586': '[EU] Season 1 Champion',
  '1424503532861526057': '[NA] Spire Champion 2024',
  '1424503857794252964': '[NA] 2v2 Mann Co. Cup Champion 2025',
  '1424503987700367442': '[EU] Spire Champion 2025',
  '1424504218781225153': '[NA] 1v1 Tournament Champion 2025',
  '1424504318870032515': '[EU] 1v1 Tournament Champion 2025',
  '1424505275544633464': '[NA] INVITE 2v2 Dolphinrider Cup Champion',
  '1424505581645074464': '[NA] OPEN 2v2 Dolphinrider Cup',
  '1424505910763458651': '[NA] 2v2 Mann Co. Cup Champion 2024',
  '1447468487227473970': '[NA] Season 1 Champion',
  '1257930116424532039': 'Tester',
  '1444833613328683040': 'TF2-QuickServer',
  '1482870303997825096': 'Reaction Roles',
  '1246530893091307531': 'Unverified',
  '1541584342600654901': 'judge',
  '1172639313649995777': '@everyone'
};

const LIVE_CATEGORIES = new Set([
  '1544215299476168745',
  '1427369407998328892',
  '1554471303245725876',
  '1172939245388824758',
  '1534360819020857355',
  '1172639313649995778',
  '1172960832460689429',
  '1532909312555618506',
  '1486856396694622368',
  '1448041985326841867'
]);

const STRUCTURAL_ROLES = new Set([
  '1172639313649995777',
  '1246530893091307531',
  '1172921417382244382',
  '1172646210193068092',
  '1540591193254133841',
  '1263277692887892060',
  '1451882174847389796',
  '1452047523299463228',
  '1452047318772875346',
  '1482495287099654185',
  '1532913859638198424',
  '1532913970497720562',
  '1444855433624944790',
  '1533649254890082346',
  '1449421498556223548',
  '1201274507277652019',
  '1448184242935824426',
  '1534360618948104212',
  '1422000591806398515',
  '1257930116424532039',
  '1444833613328683040',
  '1482870303997825096',
  '1541584342600654901',
  '1482871073153355806',
  '1217718053144367117',
  '1228919372287049792',
  '1203207583549227008',
  '1389654736986181682',
  '1522611140209934336'
]);

const TYPE = {
  0: 'GUILD_TEXT',
  2: 'GUILD_VOICE',
  4: 'GUILD_CATEGORY',
  5: 'GUILD_ANNOUNCEMENT',
  15: 'GUILD_FORUM'
};

async function api(path) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(`https://discord.com/api/v10${path}`, {
      headers: { Authorization: `Bot ${token}` }
    });
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? '1');
      await new Promise((r) => setTimeout(r, (retry + 0.25) * 1000));
      continue;
    }
    if (res.status === 404) {
      const err = new Error('404');
      err.status = 404;
      throw err;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${path} ${body.slice(0, 200)}`);
    }
    return res.json();
  }
  throw new Error(`rate limited ${path}`);
}

const channels = await api(`/guilds/${guildId}/channels`);
const byId = new Map(channels.map((c) => [c.id, c]));

function catName(ch) {
  if (ch.type === 4) return ch.name;
  if (!ch.parent_id) return '(uncategorized)';
  return byId.get(ch.parent_id)?.name ?? ch.parent_id;
}

function isLive(ch) {
  if (ch.type === 4) return LIVE_CATEGORIES.has(ch.id);
  return LIVE_CATEGORIES.has(ch.parent_id);
}

function labelRole(id) {
  return ROLE_NAMES[id] ?? `unknown-role:${id}`;
}

const memberIds = new Set();
const empty = [];
const memberHits = [];
const oddRoles = [];
const roleCounts = new Map();

for (const ch of channels) {
  const overs = ch.permission_overwrites ?? [];
  const live = isLive(ch);
  const area = live ? 'live' : 'archive';
  const channelLabel = `${TYPE[ch.type] ?? ch.type} #${ch.name}`;
  const category = catName(ch);

  for (const o of overs) {
    const allow = o.allow === '0' || o.allow === 0;
    const deny = o.deny === '0' || o.deny === 0;
    if (allow && deny) {
      empty.push({
        area,
        category,
        channel: channelLabel,
        channelId: ch.id,
        target: o.type === 1 ? `member:${o.id}` : labelRole(o.id),
        kind: o.type === 1 ? 'member' : 'role',
        id: o.id
      });
    }

    if (o.type === 1) {
      memberIds.add(o.id);
      memberHits.push({
        area,
        category,
        channel: channelLabel,
        channelId: ch.id,
        userId: o.id,
        allow: String(o.allow),
        deny: String(o.deny)
      });
    } else {
      const name = labelRole(o.id);
      roleCounts.set(name, (roleCounts.get(name) ?? 0) + 1);
      if (!STRUCTURAL_ROLES.has(o.id)) {
        oddRoles.push({
          area,
          category,
          channel: channelLabel,
          channelId: ch.id,
          role: name,
          allow: String(o.allow),
          deny: String(o.deny)
        });
      }
    }
  }
}

const members = {};
for (const id of memberIds) {
  try {
    const m = await api(`/guilds/${guildId}/members/${id}`);
    members[id] = {
      username: m.user?.username ?? '?',
      nick: m.nick ?? null,
      inGuild: true
    };
  } catch {
    members[id] = { username: '(left server)', nick: null, inGuild: false };
  }
}

function decorateMember(hit) {
  const info = members[hit.userId];
  return {
    ...hit,
    username: info?.username ?? hit.userId,
    nick: info?.nick ?? null,
    inGuild: info?.inGuild ?? false
  };
}

const decoratedMembers = memberHits.map(decorateMember);
const liveMembers = decoratedMembers.filter((h) => h.area === 'live');
const archiveMembers = decoratedMembers.filter((h) => h.area === 'archive');
const leftServer = decoratedMembers.filter((h) => !h.inGuild);

const membersByChannel = new Map();
for (const h of liveMembers) {
  const key = `${h.category} / ${h.channel}`;
  if (!membersByChannel.has(key)) membersByChannel.set(key, []);
  membersByChannel.get(key).push(h);
}

const out = {
  channelCount: channels.length,
  liveMemberOverwriteCount: liveMembers.length,
  archiveMemberOverwriteCount: archiveMembers.length,
  uniqueMembers: memberIds.size,
  leftServerCount: new Set(leftServer.map((h) => h.userId)).size,
  emptyOverwriteCount: empty.length,
  oddRoleOverwriteCount: oddRoles.length,
  liveMembersByChannel: [...membersByChannel.entries()]
    .map(([channel, hits]) => ({
      channel,
      count: hits.length,
      people: hits.map((h) => ({
        username: h.username,
        nick: h.nick,
        inGuild: h.inGuild,
        allow: h.allow,
        deny: h.deny
      }))
    }))
    .sort((a, b) => b.count - a.count),
  archiveMembersByChannel: (() => {
    const m = new Map();
    for (const h of archiveMembers) {
      const key = `${h.category} / ${h.channel}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(h);
    }
    return [...m.entries()]
      .map(([channel, hits]) => ({
        channel,
        count: hits.length,
        people: hits.map((h) => h.username)
      }))
      .sort((a, b) => b.count - a.count);
  })(),
  categoryMemberOverwrites: decoratedMembers.filter((h) =>
    h.channel.startsWith('GUILD_CATEGORY')
  ),
  empty,
  oddRoles,
  roleOverwriteCounts: [...roleCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => ({ role, count })),
  leftServer: [...new Map(leftServer.map((h) => [h.userId, h])).values()].map(
    (h) => ({
      username: h.username,
      userId: h.userId,
      channels: decoratedMembers
        .filter((x) => x.userId === h.userId)
        .map((x) => `${x.category} / ${x.channel}`)
    })
  )
};

console.log(JSON.stringify(out, null, 2));
