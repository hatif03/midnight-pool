// Wallet-less read of the shared Preview contract. Anyone (phone, no Lace) can
// verify the contract exists. Levels are not in this payload — that is the protocol.
import deployed from '../../contracts/preprod/deployed.json';

export const PREVIEW_INDEXER = 'https://indexer.preview.midnight.network/api/v4/graphql';
export const CONTRACT_ADDRESS =
  deployed.contractAddress || '749fd2e5a6a44161d56a7be1fb00a556bed169cbe18f1834d01d546a7615aaf3';

export const HALL = {
  network: deployed.network || 'preview',
  contractAddress: CONTRACT_ADDRESS,
  deployTxId: deployed.deployTxId,
  deployBlockHeight: deployed.deployBlockHeight,
  commitStatsTxId: deployed.commitStatsTxId,
  proveThresholdTxId: deployed.proveThresholdTxId,
  deployedAt: deployed.deployedAt,
  explorerContract: `https://midnight-preview.subscan.io/account/${CONTRACT_ADDRESS}`,
  explorerMidnight: 'https://preview.midnightexplorer.com/',
  explorerSubscan: 'https://midnight-preview.subscan.io/',
};

export function explorerTxUrl(txId, which = 'subscan') {
  if (!txId) return '';
  const id = String(txId).replace(/^0x/, '');
  if (which === 'midnight') return `https://preview.midnightexplorer.com/tx/${id}`;
  return `https://midnight-preview.subscan.io/extrinsic/${id}`;
}

const CONTRACT_ACTION_QUERY = `query($a:HexEncoded!){ contractAction(address:$a){ __typename address } }`;

export async function fetchContractAction(address = CONTRACT_ADDRESS) {
  const body = JSON.stringify({
    query: CONTRACT_ACTION_QUERY,
    variables: { a: address },
  });
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
