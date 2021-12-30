#!/bin/sh
set -e

cd ..
mkdir -p circom

CONTRACTS="create move"

for contract in $CONTRACTS; do
  rm -rf circom/$contract
  mkdir circom/$contract

  circom circuits/$contract.circom --r1cs --wasm -o circom/$contract
  cd circom/$contract
  node ${contract}_js/generate_witness.js ${contract}_js/${contract}.wasm ../../circuits/${contract}.json witness.wtns
  snarkjs powersoftau new bn128 12 pot12_0000.ptau
  snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="First contribution" -e="$(openssl rand -base64 20)"
  snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau
  snarkjs groth16 setup ${contract}.r1cs pot12_final.ptau ${contract}_0000.zkey
  snarkjs zkey contribute ${contract}_0000.zkey ${contract}_0001.zkey --name="Second contribution" -e="$(openssl rand -base64 20)"
  snarkjs zkey export verificationkey ${contract}_0001.zkey verification_key.json
  snarkjs groth16 prove ${contract}_0001.zkey witness.wtns proof.json public.json
  snarkjs groth16 verify verification_key.json public.json proof.json
  snarkjs zkey export solidityverifier ${contract}_0001.zkey ../../contracts/${contract}Verifier.sol

  # SnarkJS solidity template is very old, bump up the version manually
  sed -i -e 's/pragma solidity \^0.6.11/pragma solidity \^0.8.0/g' ../../contracts/${contract}Verifier.sol

  cd ../..
done
