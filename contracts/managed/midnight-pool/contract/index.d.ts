import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type PlayerStats = { level: bigint; wins: bigint };

export type Witnesses<PS> = {
  localSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  localStats(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, PlayerStats];
  localStatsSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  localCueTier(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  localBreakNonce(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  localBreakSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  commitStats(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  proveThreshold(context: __compactRuntime.CircuitContext<PS>,
                 threshold_0: bigint,
                 checkWins_0: boolean): __compactRuntime.CircuitResults<PS, boolean>;
  claimCue(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  commitBreakChoice(context: __compactRuntime.CircuitContext<PS>,
                    matchId_0: Uint8Array,
                    role_0: bigint,
                    revealDeadline_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  revealBreakChoice(context: __compactRuntime.CircuitContext<PS>,
                    matchId_0: Uint8Array,
                    role_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  resolveBreak(context: __compactRuntime.CircuitContext<PS>,
               matchId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
}

export type ProvableCircuits<PS> = {
  commitStats(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  proveThreshold(context: __compactRuntime.CircuitContext<PS>,
                 threshold_0: bigint,
                 checkWins_0: boolean): __compactRuntime.CircuitResults<PS, boolean>;
  claimCue(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  commitBreakChoice(context: __compactRuntime.CircuitContext<PS>,
                    matchId_0: Uint8Array,
                    role_0: bigint,
                    revealDeadline_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  revealBreakChoice(context: __compactRuntime.CircuitContext<PS>,
                    matchId_0: Uint8Array,
                    role_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  resolveBreak(context: __compactRuntime.CircuitContext<PS>,
               matchId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  commitStats(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  proveThreshold(context: __compactRuntime.CircuitContext<PS>,
                 threshold_0: bigint,
                 checkWins_0: boolean): __compactRuntime.CircuitResults<PS, boolean>;
  claimCue(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
  commitBreakChoice(context: __compactRuntime.CircuitContext<PS>,
                    matchId_0: Uint8Array,
                    role_0: bigint,
                    revealDeadline_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  revealBreakChoice(context: __compactRuntime.CircuitContext<PS>,
                    matchId_0: Uint8Array,
                    role_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  resolveBreak(context: __compactRuntime.CircuitContext<PS>,
               matchId_0: Uint8Array): __compactRuntime.CircuitResults<PS, bigint>;
}

export type Ledger = {
  statsCommitment: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  claimedCues: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  breakCommitment: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  breakReveal: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  breakDeadline: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  breakWinner: {
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
