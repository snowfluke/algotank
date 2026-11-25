// Every feature's messages, composed into one catalog per language. A feature
// owns its own messages.ts (exports `en` and `id`); this file only wires them in.
// To add a feature: create src/<feature>/messages.ts, import it here, and add a slot to both objects.

import * as adminPlayers from "../adminplayers/messages.ts";
import * as errors from "../api/messages.ts";
import * as auth from "../auth/messages.ts";
import * as board from "../board/messages.ts";
import * as catalogue from "../catalogue/messages.ts";
import * as champions from "../champions/messages.ts";
import * as chat from "../chat/messages.ts";
import * as create from "../create/messages.ts";
import * as guide from "../guide/messages.ts";
import * as home from "../home/messages.ts";
import * as kit from "../kit/messages.ts";
import * as live from "../live/messages.ts";
import * as metrics from "../metrics/messages.ts";
import * as monthly from "../monthly/messages.ts";
import * as mytank from "../mytank/messages.ts";
import * as practice from "../practice/messages.ts";
import * as prep from "../prep/messages.ts";
import * as publicplay from "../publicplay/messages.ts";
import * as results from "../results/messages.ts";
import * as room from "../room/messages.ts";
import * as ruleTip from "../ruletip/messages.ts";
import * as screen from "../screen/messages.ts";
import * as share from "../share/messages.ts";
import * as sound from "../sound/messages.ts";
import * as stats from "../stats/messages.ts";
import * as support from "../support/messages.ts";
import * as common from "../ui/messages.ts";
import * as vocabulary from "../vocabulary/messages.ts";
import * as theme from "../theme/messages.ts";
import * as workshop from "../workshop/messages.ts";
import type { Language } from "./language.ts";

const en = {
  common: common.en,
  home: home.en,
  auth: auth.en,
  create: create.en,
  room: room.en,
  ruleTip: ruleTip.en,
  prep: prep.en,
  vocabulary: vocabulary.en,
  live: live.en,
  screen: screen.en,
  results: results.en,
  practice: practice.en,
  board: board.en,
  errors: errors.en,
  share: share.en,
  sound: sound.en,
  kit: kit.en,
  workshop: workshop.en,
  mytank: mytank.en,
  publicplay: publicplay.en,
  champions: champions.en,
  catalogue: catalogue.en,
  monthly: monthly.en,
  guide: guide.en,
  chat: chat.en,
  support: support.en,
  metrics: metrics.en,
  adminPlayers: adminPlayers.en,
  stats: stats.en,
  theme: theme.en,
};

export type Catalog = typeof en;

const id: Catalog = {
  common: common.id,
  home: home.id,
  auth: auth.id,
  create: create.id,
  room: room.id,
  ruleTip: ruleTip.id,
  prep: prep.id,
  vocabulary: vocabulary.id,
  live: live.id,
  screen: screen.id,
  results: results.id,
  practice: practice.id,
  board: board.id,
  errors: errors.id,
  share: share.id,
  sound: sound.id,
  kit: kit.id,
  workshop: workshop.id,
  mytank: mytank.id,
  publicplay: publicplay.id,
  champions: champions.id,
  catalogue: catalogue.id,
  monthly: monthly.id,
  guide: guide.id,
  chat: chat.id,
  support: support.id,
  metrics: metrics.id,
  adminPlayers: adminPlayers.id,
  stats: stats.id,
  theme: theme.id,
};

export const CATALOGS: Record<Language, Catalog> = { en, id };
