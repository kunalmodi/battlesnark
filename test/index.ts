import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";


const player1Create = {
  "nonce": 12345,
  "ships": [
    [2, 2, 0],
    [4, 0, 1],
    [1, 0, 0],
    [5, 5, 1],
    [6, 3, 0]
  ],
};

const player2Create = {
  "nonce": 23456,
  "ships": [
    [2, 2, 0],
    [4, 0, 1],
    [1, 0, 0],
    [5, 5, 1],
    [6, 3, 0]
  ],
};

describe("Battleship", function () {
  it("Should play properly", async function () {
    const [account1, account2] = await ethers.getSigners();

    const CreateVerifier = await ethers.getContractFactory("contracts/createVerifier.sol:Verifier");
    const createVerifier = await CreateVerifier.deploy();
    await createVerifier.deployed();

    const MoveVerifier = await ethers.getContractFactory("contracts/moveVerifier.sol:Verifier");
    const moveVerifier = await MoveVerifier.deploy();
    await moveVerifier.deployed();

    const Battleship = await ethers.getContractFactory("Battleship");
    const battleship = await Battleship.deploy(createVerifier.address, moveVerifier.address);
    await battleship.deployed();
  
    const proof1 = await genCreateProof(player1Create);
    await battleship.connect(account1).createGame(proof1.solidityProof, proof1.inputs[0]);
    let game = await battleship.game(0);
    expect(game.player1 === account1.address);
    expect(game.player2 === '0x0000000000000000000000000000000000000000');
    expect(game.player1Hash.eq(BigNumber.from(proof1.inputs[0])));

    const proof2 = await genCreateProof(player2Create);
    await battleship.connect(account2).joinGame(0, proof2.solidityProof, proof2.inputs[0]);
    game = await battleship.game(0);
    expect(game.player1).to.equal(account1.address);
    expect(game.player2).to.equal(account2.address);
    expect(game.player1Hash.eq(BigNumber.from(proof1.inputs[0]))).to.equal(true);
    expect(game.player2Hash.eq(BigNumber.from(proof2.inputs[0]))).to.equal(true);
    expect(game.moves.length).to.equal(0);

    await battleship.connect(account1).submitMove(0, 1, 2, emptyProof, false);
    game = await battleship.game(0);
    expect(game.moves.length).to.equal(1);
    let prevMove = game.moves[0];
    expect(prevMove.x.eq(BigNumber.from(1))).to.equal(true);
    expect(prevMove.y.eq(BigNumber.from(2))).to.equal(true);

    const proof3 = await genMoveProof({
      // Public Inputs
      'boardHash': game.player2Hash.toString(),
      'guess': [prevMove.x.toNumber(), prevMove.y.toNumber()],
      // Private Inputs:
      'nonce': player2Create.nonce,
      'ships': player2Create.ships,
    });
    await battleship.connect(account2).submitMove(0, 0, 0, proof3.solidityProof, true);
    game = await battleship.game(0);
    expect(game.moves.length).to.equal(2);
    expect(game.moves[0].isHit).to.equal(true);
    prevMove = game.moves[1];
    expect(prevMove.x.eq(BigNumber.from(0))).to.equal(true);
    expect(prevMove.y.eq(BigNumber.from(0))).to.equal(true);

    const proof4 = await genMoveProof({
      // Public Inputs
      'boardHash': game.player1Hash.toString(),
      'guess': [prevMove.x.toNumber(), prevMove.y.toNumber()],
      // Private Inputs:
      'nonce': player1Create.nonce,
      'ships': player1Create.ships,
    });
    await battleship.connect(account1).submitMove(0, 3, 3, proof4.solidityProof, false);
    game = await battleship.game(0);
    expect(game.moves.length).to.equal(3);

  });
});

// Utils (should be split out of test/)

const snarkjs = require('snarkjs')
const fs = require('fs')
const bigInt = require("big-integer");

const emptyProof = '0x0000000000000000000000000000000000000000000000000000000000000000';

const createWC = require('../circom/create/create_js/witness_calculator.js');
const createWasm = './circom/create/create_js/create.wasm'
const createZkey = './circom/create/create_0001.zkey'
const moveWC = require('../circom/move/move_js/witness_calculator.js');
const moveWasm = './circom/move/move_js/move.wasm'
const moveZkey = './circom/move/move_0001.zkey'

const WITNESS_FILE = '/tmp/witness'

const genCreateProof = async (input: any) => {
  const buffer = fs.readFileSync(createWasm);
  const witnessCalculator = await createWC(buffer);
  const buff = await witnessCalculator.calculateWTNSBin(input);
  // The package methods read from files only, so we just shove it in /tmp/ and hope
  // there is no parallel execution.
  fs.writeFileSync(WITNESS_FILE, buff);
  const { proof, publicSignals } = await snarkjs.groth16.prove(createZkey, WITNESS_FILE);
  const solidityProof = proofToSolidityInput(proof);
  return {
    solidityProof: solidityProof,
    inputs: publicSignals,
  }
}

const genMoveProof = async (input: any) => {
  const buffer = fs.readFileSync(moveWasm);
  const witnessCalculator = await moveWC(buffer);
  const buff = await witnessCalculator.calculateWTNSBin(input);
  fs.writeFileSync(WITNESS_FILE, buff);
  const { proof, publicSignals } = await snarkjs.groth16.prove(moveZkey, WITNESS_FILE);
  const solidityProof = proofToSolidityInput(proof);
  return {
    solidityProof: solidityProof,
    inputs: publicSignals,
  }
}

// Instead of passing in a large array of numbers (annoying), we
// just make proof a single string (which will be decompiled as a uint32
// in the contract)
// Copied from Tornado's websnark fork:
// https://github.com/tornadocash/websnark/blob/master/src/utils.js
const proofToSolidityInput = (proof: any): string => {
  const proofs: string[] = [
    proof.pi_a[0], proof.pi_a[1],
    proof.pi_b[0][1], proof.pi_b[0][0],
    proof.pi_b[1][1], proof.pi_b[1][0],
    proof.pi_c[0], proof.pi_c[1],
  ];
  const flatProofs = proofs.map(p => bigInt(p));
  return "0x" + flatProofs.map(x => toHex32(x)).join("")
}

const toHex32 = (num: number) => {
  let str = num.toString(16);
  while (str.length < 64) str = "0" + str;
  return str;
}
