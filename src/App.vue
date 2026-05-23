<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import AddressCell from "./components/AddressCell.vue";
import QueueTable from "./components/QueueTable.vue";
import SectionBlock from "./components/SectionBlock.vue";
import StatCard from "./components/StatCard.vue";
import { useVaultData } from "./composables/useVaultData";
import {
  BALANCED_ROUTING_MODE,
  NETWORKS,
  type NetworkKey,
} from "./config/networks";
import { explorerAddressUrl, getDefaultVaultAddress, resolveNetworkKey } from "./lib/contracts";
import {
  formatBps,
  formatBlock,
  formatDateTime,
  formatNav,
  formatShares,
  formatTimestamp,
  formatUma,
} from "./lib/format";
import { computePhaseTiming, formatDuration } from "./lib/votingTiming";
import type { VaultSnapshot } from "./types";

const { t, locale } = useI18n();

const networkKey = ref<NetworkKey>(resolveNetworkKey());
const autoRefresh = ref(true);
const net = computed(() => NETWORKS[networkKey.value]);
const vaultAddress = computed(() => getDefaultVaultAddress(networkKey.value));

const { data, state, error, refresh, isStale, sectionState } = useVaultData(
  () => networkKey.value,
  () => vaultAddress.value,
  () => autoRefresh.value
);

const NAV_ITEMS = [
  { id: "overview", key: "nav.overview" },
  { id: "governance", key: "nav.governance" },
  { id: "assets", key: "nav.assets" },
  { id: "parameters", key: "nav.parameters" },
  { id: "proxies", key: "nav.proxies" },
  { id: "voting", key: "nav.voting" },
  { id: "redeem-queue", key: "nav.redeemQueue" },
  { id: "candidate-queue", key: "nav.candidateQueue" },
  { id: "raw-data", key: "nav.rawData" },
] as const;

function toggleLang() {
  const next = locale.value.startsWith("zh") ? "en" : "zh";
  locale.value = next;
  localStorage.setItem("ops-lang", next);
}

function deriveSystemStatus(d: VaultSnapshot): "ok" | "warn" | "bad" {
  if (!d.systemGovernanceOk || (d.depositPaused && d.redeemPaused && d.claimPaused)) return "bad";
  if (!d.shareGovernanceOk || d.depositPaused || d.redeemPaused || d.claimPaused) return "warn";
  if (d.proxies.some((p) => !p.governanceConsistent)) return "warn";
  return "ok";
}

const systemTone = computed(() => {
  if (!data.value) return "neutral";
  const s = deriveSystemStatus(data.value);
  return s === "ok" ? "ok" : s === "warn" ? "warn" : "bad";
});

const pendingRedeemAssets = computed(() =>
  data.value?.redeemQueue.reduce((s, r) => s + r.assets, 0n) ?? 0n
);
const readyRedeemAssets = computed(() =>
  data.value?.redeemQueue.filter((r) => r.claimable).reduce((s, r) => s + r.assets, 0n) ?? 0n
);
const candidateShares = computed(() =>
  data.value?.candidateQueue.reduce((s, r) => s + r.shares, 0n) ?? 0n
);

function routingLabel(mode: bigint) {
  return mode === BALANCED_ROUTING_MODE
    ? t("parameters.routingAuto")
    : t("parameters.routingManual", { index: String(mode) });
}

function phaseLabel(phase: number) {
  return phase === 0 ? "Commit" : phase === 1 ? "Reveal" : t("status.unknown");
}

const nowSec = ref(Math.floor(Date.now() / 1000));
let nowTick: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  nowTick = setInterval(() => {
    nowSec.value = Math.floor(Date.now() / 1000);
  }, 30_000);
});

onUnmounted(() => {
  if (nowTick) clearInterval(nowTick);
});

const phaseTiming = computed(() => {
  if (!data.value?.roundEndTime) return null;
  return computePhaseTiming(data.value.votePhase, data.value.roundEndTime, nowSec.value);
});

function exportJson() {
  if (!data.value) return;
  const blob = new Blob(
    [JSON.stringify(data.value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vault-ops-${data.value.blockNumber}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="app">
    <header class="top-header">
      <div class="brand">
        <h1>{{ t("app.title") }}</h1>
        <p>{{ t("app.subtitle") }}</p>
      </div>
      <div class="header-actions">
        <select v-model="networkKey">
          <option v-for="n in Object.values(NETWORKS)" :key="n.key" :value="n.key">{{ n.label }}</option>
        </select>
        <button type="button" @click="toggleLang">{{ locale.startsWith("zh") ? "EN" : "中文" }}</button>
        <label class="toggle">
          <input v-model="autoRefresh" type="checkbox" />
          {{ t("header.autoRefresh") }}
        </label>
        <button type="button" class="primary" :disabled="state === 'loading'" @click="refresh">
          {{ t("header.refresh") }}
        </button>
      </div>
    </header>

    <div class="meta-bar">
      <div><span class="meta-k">{{ t("header.network") }}</span><span>{{ net.label }}</span></div>
      <div>
        <span class="meta-k">{{ t("header.vault") }}</span>
        <AddressCell v-if="data" :address="data.vault" :explorer="net.explorer" />
        <code v-else>—</code>
      </div>
      <div>
        <span class="meta-k">{{ t("header.share") }}</span>
        <AddressCell v-if="data" :address="data.shareToken" :explorer="net.explorer" />
        <code v-else>—</code>
      </div>
      <div>
        <span class="meta-k">{{ t("header.voting") }}</span>
        <AddressCell v-if="data" :address="data.votingV2" :explorer="net.explorer" />
        <code v-else>—</code>
      </div>
      <div>
        <span class="meta-k">{{ t("header.block") }}</span>
        <span class="mono">{{ data ? formatBlock(data.blockNumber) : "—" }}</span>
      </div>
      <div>
        <span class="meta-k">{{ t("header.lastUpdated") }}</span>
        <span>{{ data ? formatDateTime(data.updatedAt) : "—" }}</span>
      </div>
    </div>

    <div v-if="error || isStale" class="banner" :class="error ? 'banner-error' : 'banner-warn'">
      {{ error ?? t("header.stale") }}
    </div>

    <nav class="sticky-nav">
      <a v-for="item in NAV_ITEMS" :key="item.id" :href="`#${item.id}`">{{ t(item.key) }}</a>
    </nav>

    <p v-if="!data && state === 'loading'" class="page-loading">{{ t("header.loading") }}</p>

    <main v-if="data">
      <SectionBlock id="overview" :title="t('overview.title')" :state="sectionState">
        <div class="card-grid">
          <StatCard
            :label="t('overview.systemStatus')"
            :value="t(`status.${systemTone === 'ok' ? 'healthy' : systemTone === 'warn' ? 'warning' : 'critical'}`)"
            :tone="systemTone === 'neutral' ? 'neutral' : systemTone"
          />
          <StatCard
            :label="t('overview.governance')"
            :value="data.systemGovernanceOk ? t('status.pass') : t('status.fail')"
            :tone="data.systemGovernanceOk ? 'ok' : 'bad'"
          />
          <StatCard :label="t('overview.totalAssets')" :value="`${formatUma(data.totalAssets)} UMA`" />
          <StatCard :label="t('overview.umaVSupply')" :value="`${formatShares(data.totalSupply)} UMA-V`" />
          <StatCard :label="t('overview.nav')" :value="`${formatNav(data.totalAssets, data.totalSupply)} UMA`" />
          <StatCard :label="t('overview.currentRound')" :value="`#${data.currentRoundId} · ${phaseLabel(data.votePhase)}`" />
          <StatCard :label="t('overview.lastTrackerUpdate')" :value="`#${data.lastRoundIdTrackersUpdated}`" />
        </div>
        <div class="card-grid">
          <StatCard :label="t('overview.unallocated')" :value="`${formatUma(data.unallocatedManagedAssets)} UMA`" />
          <StatCard :label="t('overview.reserved')" :value="`${formatUma(data.reservedForClaims)} UMA`" />
          <StatCard :label="t('overview.feesAccrued')" :value="`${formatUma(data.protocolFeesAccrued)} UMA`" />
          <StatCard :label="t('overview.readyToClaim')" :value="`${formatUma(data.totalReadyToClaimOutstanding)} UMA`" />
          <StatCard :label="t('overview.redeemQueue')" :value="String(data.redeemQueue.length)" />
          <StatCard :label="t('overview.candidateQueue')" :value="String(data.candidateQueue.length)" />
          <StatCard :label="t('overview.activeProxies')" :value="`${data.activeProxyCount} / ${data.proxyAddresses.length}`" />
        </div>
        <div class="pause-bar">
          <span>{{ t("overview.pauseFlags") }}:</span>
          <span :class="data.depositPaused ? 'paused' : 'active'">{{ t("overview.deposit") }}: {{ data.depositPaused ? t("status.paused") : t("status.active") }}</span>
          <span :class="data.redeemPaused ? 'paused' : 'active'">{{ t("overview.redeem") }}: {{ data.redeemPaused ? t("status.paused") : t("status.active") }}</span>
          <span :class="data.claimPaused ? 'paused' : 'active'">{{ t("overview.claim") }}: {{ data.claimPaused ? t("status.paused") : t("status.active") }}</span>
        </div>
      </SectionBlock>

      <SectionBlock id="governance" :title="t('governance.title')" :state="sectionState">
        <div class="two-col">
          <div class="panel">
            <h3>{{ t("governance.systemCheck") }}</h3>
            <div class="check-row" :class="data.systemGovernanceOk ? 'ok' : 'bad'">
              <span>isSystemGovernanceConsistent</span>
              <strong>{{ data.systemGovernanceOk ? t("status.pass") : t("status.fail") }}</strong>
            </div>
          </div>
          <div class="panel">
            <h3>{{ t("governance.shareCheck") }}</h3>
            <div class="check-row" :class="data.shareGovernanceOk ? 'ok' : 'bad'">
              <span>isShareGovernanceConsistent</span>
              <strong>{{ data.shareGovernanceOk ? t("status.pass") : t("status.fail") }}</strong>
            </div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ t("governance.proxy") }}</th>
                <th>{{ t("governance.status") }}</th>
                <th>{{ t("governance.governance") }}</th>
                <th>{{ t("governance.stakePaused") }}</th>
                <th>{{ t("governance.withdrawPaused") }}</th>
                <th>{{ t("governance.reqUnstakePaused") }}</th>
                <th>{{ t("governance.execUnstakePaused") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in data.proxies" :key="p.address">
                <td><AddressCell :address="p.address" :explorer="net.explorer" /></td>
                <td>{{ p.status }}</td>
                <td>{{ p.governanceConsistent ? t("status.pass") : t("status.fail") }}</td>
                <td>{{ p.stakePaused ? t("status.paused") : t("status.active") }}</td>
                <td>{{ p.withdrawPaused ? t("status.paused") : t("status.active") }}</td>
                <td>{{ p.requestUnstakePaused ? t("status.paused") : t("status.active") }}</td>
                <td>{{ p.executeUnstakePaused ? t("status.paused") : t("status.active") }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="panel roles">
          <h3>{{ t("governance.roles") }}</h3>
          <div class="roles-grid">
            <dl class="roles-col">
              <dt>{{ t("governance.owner") }}</dt>
              <dd><AddressCell :address="data.owner" :explorer="net.explorer" /></dd>
              <dt>{{ t("governance.manager") }}</dt>
              <dd>
                <AddressCell
                  v-if="data.firstProxyManager"
                  :address="data.firstProxyManager"
                  :explorer="net.explorer"
                />
                <span v-else class="muted">—</span>
              </dd>
              <dt>{{ t("governance.timelock") }}</dt>
              <dd><AddressCell :address="data.upgradeTimelock" :explorer="net.explorer" /></dd>
            </dl>
            <dl class="roles-col">
              <dt>{{ t("governance.feeRecipient") }}</dt>
              <dd><AddressCell :address="data.feeRecipient" :explorer="net.explorer" /></dd>
              <dt>{{ t("governance.vault") }}</dt>
              <dd><AddressCell :address="data.vault" :explorer="net.explorer" /></dd>
              <dt>{{ t("governance.share") }}</dt>
              <dd><AddressCell :address="data.shareToken" :explorer="net.explorer" /></dd>
              <dt>{{ t("governance.voting") }}</dt>
              <dd><AddressCell :address="data.votingV2" :explorer="net.explorer" /></dd>
            </dl>
          </div>
        </div>
      </SectionBlock>

      <SectionBlock id="assets" :title="t('assets.title')" :state="sectionState">
        <div class="table-wrap">
          <table>
            <thead><tr><th>{{ t("assets.metrics") }}</th><th>{{ t("assets.value") }}</th></tr></thead>
            <tbody>
              <tr><td>totalAssets</td><td class="mono">{{ formatUma(data.totalAssets) }} UMA</td></tr>
              <tr><td>totalSupply (UMA-V)</td><td class="mono">{{ formatShares(data.totalSupply) }}</td></tr>
              <tr><td>NAV</td><td class="mono">{{ formatNav(data.totalAssets, data.totalSupply) }} UMA / UMA-V</td></tr>
              <tr><td>Vault UMA balance</td><td class="mono">{{ formatUma(data.vaultUmaBalance) }} UMA</td></tr>
              <tr><td>reservedForClaims</td><td class="mono">{{ formatUma(data.reservedForClaims) }} UMA</td></tr>
              <tr><td>protocolFeesAccrued</td><td class="mono">{{ formatUma(data.protocolFeesAccrued) }} UMA</td></tr>
              <tr><td>totalReadyToClaimOutstanding</td><td class="mono">{{ formatUma(data.totalReadyToClaimOutstanding) }} UMA</td></tr>
              <tr><td>unallocatedManagedAssets</td><td class="mono">{{ formatUma(data.unallocatedManagedAssets) }} UMA</td></tr>
            </tbody>
          </table>
        </div>
        <h3 class="subhead">{{ t("assets.proxySummary") }}</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ t("governance.proxy") }}</th>
                <th>{{ t("governance.status") }}</th>
                <th>{{ t("assets.staked") }}</th>
                <th>{{ t("assets.pendingUnstake") }}</th>
                <th>{{ t("assets.outstandingWithdraw") }}</th>
                <th>{{ t("assets.totalManaged") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in data.proxies" :key="p.address">
                <td><AddressCell :address="p.address" :explorer="net.explorer" /></td>
                <td>{{ p.status }}</td>
                <td class="mono">{{ formatUma(p.staked) }}</td>
                <td class="mono">{{ formatUma(p.pendingUnstake) }}</td>
                <td class="mono">{{ formatUma(p.outstandingWithdraw) }}</td>
                <td class="mono">{{ formatUma(p.staked + p.pendingUnstake + p.outstandingWithdraw) }}</td>
              </tr>
              <tr>
                <td><strong>{{ t("assets.total") }}</strong></td>
                <td />
                <td class="mono">{{ formatUma(data.proxies.reduce((s, p) => s + p.staked, 0n)) }}</td>
                <td class="mono">{{ formatUma(data.proxies.reduce((s, p) => s + p.pendingUnstake, 0n)) }}</td>
                <td class="mono">{{ formatUma(data.proxies.reduce((s, p) => s + p.outstandingWithdraw, 0n)) }}</td>
                <td class="mono">{{ formatUma(data.proxies.reduce((s, p) => s + p.staked + p.pendingUnstake + p.outstandingWithdraw, 0n)) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionBlock>

      <SectionBlock id="parameters" :title="t('parameters.title')" :state="sectionState">
        <div class="two-col">
          <div class="panel">
            <h3>{{ t("parameters.keyParams") }}</h3>
            <dl class="kv">
              <dt>{{ t("parameters.protocolFeeBps") }}</dt><dd>{{ formatBps(data.protocolFeeBps) }}</dd>
              <dt>{{ t("parameters.feeRecipient") }}</dt><dd><AddressCell :address="data.feeRecipient" :explorer="net.explorer" /></dd>
              <dt>{{ t("parameters.depositAdjustBps") }}</dt><dd>{{ formatBps(data.depositShareAdjustBps) }}</dd>
              <dt>{{ t("parameters.maxDeposit") }}</dt><dd>{{ formatUma(data.limits.maxDepositPerTx) }} UMA</dd>
              <dt>{{ t("parameters.minDeposit") }}</dt><dd>{{ formatUma(data.limits.minDepositPerTx) }} UMA</dd>
              <dt>{{ t("parameters.maxRedeem") }}</dt><dd>{{ formatShares(data.limits.maxRedeemSharesPerTx) }} UMA-V</dd>
              <dt>{{ t("parameters.minRedeem") }}</dt><dd>{{ formatShares(data.limits.minRedeemSharesPerTx) }} UMA-V</dd>
            </dl>
          </div>
          <div class="panel">
            <h3>{{ t("parameters.dynamicParams") }}</h3>
            <dl class="kv">
              <dt>{{ t("parameters.currentRound") }}</dt><dd>#{{ data.currentRoundId }}</dd>
              <dt>{{ t("parameters.lastUnstakeRound") }}</dt><dd>#{{ data.lastUnstakeRoundId }}</dd>
              <dt>{{ t("parameters.stakeRouting") }}</dt><dd>{{ routingLabel(data.stakeRoutingMode) }}</dd>
              <dt>{{ t("parameters.lastTracker") }}</dt><dd>#{{ data.lastRoundIdTrackersUpdated }}</dd>
            </dl>
          </div>
        </div>
      </SectionBlock>

      <SectionBlock id="proxies" :title="t('proxies.title')" :state="sectionState">
        <div class="proxy-cards">
          <article v-for="(p, i) in data.proxies" :key="p.address" class="proxy-card" :class="`status-${p.status.toLowerCase()}`">
            <div class="proxy-card-head">
              <h3>StakeProxy #{{ i + 1 }}</h3>
              <span class="tag">{{ p.status }}</span>
            </div>
            <p><AddressCell :address="p.address" :explorer="net.explorer" /></p>
            <ul>
              <li>{{ t("proxies.governance") }}: {{ p.governanceConsistent ? t("status.pass") : t("status.fail") }}</li>
              <li>{{ t("proxies.staked") }}: {{ formatUma(p.staked) }} UMA</li>
              <li>{{ t("proxies.pending") }}: {{ formatUma(p.pendingUnstake) }} UMA</li>
              <li>{{ t("proxies.withdraw") }}: {{ formatUma(p.outstandingWithdraw) }} UMA</li>
              <li class="proxy-field-stacked">
                <span>{{ t("proxies.unstakeReady") }}:</span>
                <span class="proxy-field-value">{{ formatTimestamp(p.unstakeReadyTime) }}</span>
              </li>
              <li>{{ t("proxies.commit") }}: {{ p.committedCurrentRound ? t("status.yes") : t("status.no") }}</li>
              <li>{{ t("proxies.reveal") }}: {{ p.revealedCurrentRound ? t("status.yes") : t("status.no") }}</li>
            </ul>
          </article>
        </div>
      </SectionBlock>

      <SectionBlock id="voting" :title="t('voting.title')" :state="sectionState">
        <p class="hint voting-hint">{{ t("voting.phaseDurationHint") }}</p>
        <div class="card-grid">
          <StatCard :label="t('voting.round')" :value="`#${data.currentRoundId}`" />
          <StatCard :label="t('voting.phase')" :value="phaseLabel(data.votePhase)" />
          <StatCard
            :label="t('voting.phaseStart')"
            :value="phaseTiming ? formatTimestamp(phaseTiming.currentPhaseStart) : '—'"
          />
          <StatCard
            :label="t('voting.phaseEnd')"
            :value="phaseTiming ? formatTimestamp(phaseTiming.currentPhaseEnd) : '—'"
          />
          <StatCard
            :label="t('voting.remaining')"
            :value="phaseTiming ? formatDuration(phaseTiming.remainingSeconds) : '—'"
          />
          <StatCard :label="t('voting.trackerRound')" :value="`#${data.lastRoundIdTrackersUpdated}`" />
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ t("governance.proxy") }}</th>
                <th>{{ t("governance.status") }}</th>
                <th>{{ t("voting.committed") }}</th>
                <th>{{ t("voting.revealed") }}</th>
                <th>{{ t("voting.lastCommit") }}</th>
                <th>{{ t("voting.lastReveal") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in data.proxies" :key="p.address">
                <td><AddressCell :address="p.address" :explorer="net.explorer" /></td>
                <td>{{ p.status }}</td>
                <td>{{ p.committedCurrentRound ? t("status.yes") : t("status.no") }}</td>
                <td>{{ p.revealedCurrentRound ? t("status.yes") : t("status.no") }}</td>
                <td class="mono">{{ p.lastCommitRoundId != null ? `#${p.lastCommitRoundId}` : "—" }}</td>
                <td class="mono">{{ p.lastRevealRoundId != null ? `#${p.lastRevealRoundId}` : "—" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionBlock>

      <SectionBlock id="redeem-queue" :title="t('queue.title')" :state="sectionState">
        <div class="card-grid">
          <StatCard :label="t('queue.length')" :value="String(data.redeemQueue.length)" />
          <StatCard :label="t('queue.pendingAssets')" :value="`${formatUma(pendingRedeemAssets)} UMA`" />
          <StatCard :label="t('queue.readyAssets')" :value="`${formatUma(readyRedeemAssets)} UMA`" />
        </div>
        <QueueTable :items="data.redeemQueue" :explorer="net.explorer" />
      </SectionBlock>

      <SectionBlock id="candidate-queue" :title="t('queue.candidateTitle')" :state="sectionState">
        <div class="card-grid">
          <StatCard :label="t('queue.length')" :value="String(data.candidateQueue.length)" />
          <StatCard :label="t('queue.candidateShares')" :value="formatShares(candidateShares)" />
        </div>
        <QueueTable :items="data.candidateQueue" :explorer="net.explorer" />
      </SectionBlock>

      <SectionBlock id="raw-data" :title="t('raw.title')" :state="sectionState">
        <p class="hint">{{ t("raw.hint") }}</p>
        <button type="button" class="primary" @click="exportJson">{{ t("raw.export") }}</button>
        <pre class="raw-json">{{ JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) }}</pre>
      </SectionBlock>
    </main>

    <footer class="footer">
      {{ t("footer") }} ·
      <a :href="explorerAddressUrl(net.explorer, vaultAddress)" target="_blank" rel="noreferrer">Vault</a>
    </footer>
  </div>
</template>
