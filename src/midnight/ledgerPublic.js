// Wallet-less read of the shared Preview contract. Anyone (phone, no Lace) can
// verify the contract exists. Levels are not in this payload — that is the protocol.
//
// Midnight submitTx returns a ZSwap *identifier* (`tx.identifiers()[0]`), not the
// transaction *hash* explorers put in their URL. Subscan `/account` is a wallet
// address; Compact contracts live at `/contract`. See explorerContractUrl / explorerTxUrl.
import deployed from '../../contracts/preprod/deployed.json';

export const PREVIEW_INDEXER = 'https://indexer.preview.midnight.network/api/v4/graphql';
export const CONTRACT_ADDRESS =
  deployed.contractAddress || '749fd2e5a6a44161d56a7be1fb00a556bed169cbe18f1834d01d546a7615aaf3';

export function stripHex(value) {
  return String(value || '').replace(/^0x/i, '').toLowerCase();
}

export function hex0x(value) {
  const h = stripHex(value);
  return h ? `0x${h}` : '';
}

export function explorerContractUrl(address = CONTRACT_ADDRESS, which = 'midnight') {
  const a = hex0x(address);
  if (!a) return '';
  if (which === 'subscan') return `https://midnight-preview.subscan.io/contract/${a}`;
  return `https://preview.midnightexplorer.com/contracts/${a}`;
}

export function explorerTxUrl(hash, which = 'midnight') {
  const h = hex0x(hash);
  if (!h) return '';
  if (which === 'subscan') return `https://midnight-preview.subscan.io/tx/${h}`;
  return `https://preview.midnightexplorer.com/transactions/${h}`;
}

const KNOWN_TX_HASH = new Map([
  [stripHex(deployed.deployTxId), stripHex(deployed.deployTxHash)],
  [stripHex(deployed.commitStatsTxId), stripHex(deployed.commitStatsTxHash)],
  [stripHex(deployed.proveThresholdTxId), stripHex(deployed.proveThresholdTxHash)],
].filter(([, hash]) => hash));

export function knownTxHash(identifierOrHash) {
  const key = stripHex(identifierOrHash);
  if (!key) return '';
  if (KNOWN_TX_HASH.has(key)) return KNOWN_TX_HASH.get(key);
  for (const hash of KNOWN_TX_HASH.values()) {
    if (hash === key) return hash;
  }
  return '';
}

export const HALL = {
  network: deployed.network || 'preview',
  contractAddress: CONTRACT_ADDRESS,
  deployTxId: deployed.deployTxId,
  deployTxHash: deployed.deployTxHash,
  deployBlockHeight: deployed.deployBlockHeight,
  commitStatsTxId: deployed.commitStatsTxId,
  commitStatsTxHash: deployed.commitStatsTxHash,
  proveThresholdTxId: deployed.proveThresholdTxId,
  proveThresholdTxHash: deployed.proveThresholdTxHash,
  deployedAt: deployed.deployedAt,
  explorerContract: explorerContractUrl(CONTRACT_ADDRESS),
  explorerMidnight: explorerContractUrl(CONTRACT_ADDRESS),
  explorerSubscan: explorerContractUrl(CONTRACT_ADDRESS, 'subscan'),
};

const CONTRACT_ACTION_QUERY = `query($a:HexEncoded!){ contractAction(address:$a){ __typename address } }`;

async function postIndexer(query, variables) {
  const body = JSON.stringify({ query, variables });
  const tryFetch = async (url) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    if (!r.ok) throw new Error(`indexer ${r.status}`);
    return r.json();
  };

  try {
    return await tryFetch('/api/ledger');
  } catch {
    return tryFetch(PREVIEW_INDEXER);
  }
}

export async function fetchContractAction(address = CONTRACT_ADDRESS) {
  return postIndexer(CONTRACT_ACTION_QUERY, { a: address });
}

export async function resolveTxHashes(identifiers) {
  const ids = [...new Set((identifiers || []).map(stripHex).filter(Boolean))];
  const map = new Map();
  for (const id of ids) {
    const known = knownTxHash(id);
    if (known) map.set(id, known);
  }
  const missing = ids.filter((id) => !map.has(id)).slice(0, 8);
  if (!missing.length) return map;

  const arg = missing.map((_, i) => `$i${i}:HexEncoded!`).join(', ');
  const fields = missing.map((_, i) => `t${i}: transactions(offset:{identifier:$i${i}}) { hash }`).join(' ');
  const variables = Object.fromEntries(missing.map((id, i) => [`i${i}`, id]));
  try {
    const json = await postIndexer(`query(${arg}){ ${fields} }`, variables);
    missing.forEach((id, i) => {
      const hash = stripHex(json?.data?.[`t${i}`]?.[0]?.hash);
      if (hash) map.set(id, hash);
    });
  } catch {
    // Hall still has baked hashes; Rail falls back to the contract page.
  }
  return map;
}

export function parseContractAction(json) {
  const action = json?.data?.contractAction;
  if (!action) {
    const err = json?.errors?.[0]?.message;
    return { ok: false, error: err || 'no contractAction', typename: null, address: null };
  }
  return {
    ok: true,
    typename: action.__typename || null,
    address: action.address || null,
    error: null,
  };
}
