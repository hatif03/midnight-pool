import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  openStake(context: __compactRuntime.CircuitContext<PS>,
            matchId_0: Uint8Array,
            role_0: bigint,
            amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  attestResult(context: __compactRuntime.CircuitContext<PS>,
               matchId_0: Uint8Array,
               role_0: bigint,
               winner_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  resolveStake(context: __compactRuntime.CircuitContext<PS>,
               matchId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
}

export type ProvableCircuits<PS> = {
  openStake(context: __compactRuntime.CircuitContext<PS>,
            matchId_0: Uint8Array,
            role_0: bigint,
            amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  attestResult(context: __compactRuntime.CircuitContext<PS>,
               matchId_0: Uint8Array,
               role_0: bigint,
               winner_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  resolveStake(context: __compactRuntime.CircuitContext<PS>,
               matchId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  openStake(context: __compactRuntime.CircuitContext<PS>,
            matchId_0: Uint8Array,
            role_0: bigint,
            amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  attestResult(context: __compactRuntime.CircuitContext<PS>,
               matchId_0: Uint8Array,
               role_0: bigint,
               winner_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  resolveStake(context: __compactRuntime.CircuitContext<PS>,
               matchId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
}

export type Ledger = {
  stakeOpened: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  stakeAttestation: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
