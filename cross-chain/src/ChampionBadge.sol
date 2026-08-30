// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Minimal on-chain registry for Midnight Pool's cross-chain Champion Badge (docs/adr/0007).
///
/// Deliberately NOT a full ERC-721: this demo's point is the cross-chain *join* (EVM ownership +
/// a Midnight-disclosed rank, read independently by join.mjs and combined into one view, no
/// bridge, no message-passing) -- not NFT marketplace compliance. `holder` doubles as the key
/// shared with the Midnight side (see join.mjs for how that key is derived).
contract ChampionBadge {
    address public owner;
    mapping(address => uint8) public tier; // 0 = none

    event BadgeMinted(address indexed holder, uint8 tier);

    constructor() {
        owner = msg.sender;
    }

    function mint(address holder, uint8 badgeTier) external {
        require(msg.sender == owner, "only owner");
        require(badgeTier > 0, "tier must be > 0");
        tier[holder] = badgeTier;
        emit BadgeMinted(holder, badgeTier);
    }
}
