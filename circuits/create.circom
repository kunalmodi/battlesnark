pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "./consts.circom";

template BattleshipCreate() {
  signal input nonce;
  signal input ships[5][3]; // [x,y,direction]

  signal output out;

  var boardSize = getBoardSize();
  var lengths[5] = getShipLengths();
  var pts[boardSize][boardSize] = getEmptyBoard();

  for (var i = 0; i < 5; i++) {
    var len = lengths[i];
    // validate starting position
    assert(ships[i][0] >= 0 && ships[i][0] < boardSize);
    assert(ships[i][1] >= 0 && ships[i][1] < boardSize);
    // validate boats don't overflow off board
    if (ships[i][2] == 0) { // Down
      assert(ships[i][1] + len < boardSize);
    } else {
      assert(ships[i][0] + len < boardSize);
    }
    // validate no overlap
    for (var l = 0; l < len; l++) {
      var x_a = ships[i][2] == 0 ? 0 : l;
      var y_a = ships[i][2] == 0 ? l : 0;
      var x = ships[i][0] + x_a;
      var y = ships[i][1] + y_a;
      assert(pts[x][y] == 0);
      pts[x][y] = 1;
    }
  }

  component poseidon = Poseidon(6);
  poseidon.inputs[0] <== nonce;
  for (var i = 0; i < 5; i++) {
    poseidon.inputs[i+1] <== ships[i][0] + (ships[i][1] * (10 ** 1)) + (ships[i][2] * (10 ** 2));
  }
  out <-- poseidon.out;
}

component main = BattleshipCreate();
