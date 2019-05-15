'use strict'
var ethutil = require('ethereumjs-util')

/*
 contains misc util: @TODO should be splitted
  - hex convertion
  - binary search
  - CALL related look up
  - sha3 calculation
  - swarm hash extraction
  - bytecode comparison
*/
module.exports = {
  /*
    ints: IntArray
  */
  hexConvert: function (ints) {
    var ret = '0x'
    for (var i = 0; i < ints.length; i++) {
      var h = ints[i]
      if (h) {
        ret += (h <= 0xf ? '0' : '') + h.toString(16)
      } else {
        ret += '00'
      }
    }
    return ret
  },

  /**
   * Converts a hex string to an array of integers.
   */
  hexToIntArray: function (hexString) {
    if (hexString.slice(0, 2) === '0x') {
      hexString = hexString.slice(2)
    }
    var integers = []
    for (var i = 0; i < hexString.length; i += 2) {
      integers.push(parseInt(hexString.slice(i, i + 2), 16))
    }
    return integers
  },

  /*
    ints: list of BNs
  */
  hexListFromBNs: function (bnList) {
    var ret = []
    for (var k in bnList) {
      var v = bnList[k]
      if (ethutil.BN.isBN(v)) {
        ret.push('0x' + v.toString('hex', 64))
      } else {
        ret.push('0x' + (new ethutil.BN(v)).toString('hex', 64)) // TEMP FIX TO REMOVE ONCE https://github.com/ethereumjs/simplechainjs-vm/pull/293 is released
      }
    }
    return ret
  },

  /*
    ints: list of IntArrays
  */
  hexListConvert: function (intsList) {
    var ret = []
    for (var k in intsList) {
      ret.push(this.hexConvert(intsList[k]))
    }
    return ret
  },

  /*
    ints: ints: IntArray
  */
  formatMemory: function (mem) {
    var hexMem = this.hexConvert(mem).substr(2)
    var ret = []
    for (var k = 0; k < hexMem.length; k += 32) {
      var row = hexMem.substr(k, 32)
      ret.push(row)
    }
    return ret
  },

  /*
    Binary Search:
    Assumes that @arg array is sorted increasingly
    return largest i such that array[i] <= target; return -1 if array[0] > target || array is empty
  */
  findLowerBound: function (target, array) {
    var start = 0
    var length = array.length
    while (length > 0) {
      var half = length >> 1
      var middle = start + half
      if (array[middle] <= target) {
        length = length - 1 - half
        start = middle + 1
      } else {
        length = half
      }
    }
    return start - 1
  },

  /*
    Binary Search:
    Assumes that @arg array is sorted increasingly
    return largest array[i] such that array[i] <= target; return null if array[0] > target || array is empty
  */
  findLowerBoundValue: function (target, array) {
    var index = this.findLowerBound(target, array)
    return index >= 0 ? array[index] : null
  },

  /*
    Binary Search:
    Assumes that @arg array is sorted increasingly
    return Return i such that |array[i] - target| is smallest among all i and -1 for an empty array.
    Returns the smallest i for multiple candidates.
  */
  findClosestIndex: function (target, array) {
    if (array.length === 0) {
      return -1
    }
    var index = this.findLowerBound(target, array)
    if (index < 0) {
      return 0
    } else if (index >= array.length - 1) {
      return array.length - 1
    } else {
      var middle = (array[index] + array[index + 1]) / 2
      return target <= middle ? index : index + 1
    }
  },

  /**
    * Find the call from @args rootCall which contains @args index (recursive)
    *
    * @param {Int} index - index of the vmtrace
    * @param {Object} rootCall  - call tree, built by the trace analyser
    * @return {Object} - return the call which include the @args index
    */
  findCall: findCall,

   /**
    * Find calls path from @args rootCall which leads to @args index (recursive)
    *
    * @param {Int} index - index of the vmtrace
    * @param {Object} rootCall  - call tree, built by the trace analyser
    * @return {Array} - return the calls path to @args index
    */
  buildCallPath: buildCallPath,

  /**
  * sha3 the given @arg value (left pad to 32 bytes)
  *
  * @param {String} value - value to sha3
  * @return {Object} - return sha3ied value
  */
  sha3_256: function (value) {
    if (typeof value === 'string' && value.indexOf('0x') !== 0) {
      value = '0x' + value
    }
    var ret = ethutil.bufferToHex(ethutil.setLengthLeft(value, 32))
    ret = ethutil.sha3(ret)
    return ethutil.bufferToHex(ret)
  },

  /**
    * return a regex which extract the swarmhash from the bytecode.
    *
    * @return {RegEx}
    */
  swarmHashExtraction: function () {
    return /a165627a7a72305820([0-9a-f]{64})0029$/
  },

  /**
    * Compare bytecode. return true if the code is equal (handle swarm hash and library references)
    * @param {String} code1 - the bytecode that is actually deployed (contains resolved library reference and a potentially different swarmhash)
    * @param {String} code2 - the bytecode generated by the compiler (contains unresolved library reference and a potentially different swarmhash)
                              this will return false if the generated bytecode is empty (asbtract contract cannot be deployed)
    *
    * @return {bool}
    */
  compareByteCode: function (code1, code2) {
    if (code1 === code2) return true
    if (code2 === '0x') return false // abstract contract. see comment

    if (code2.substr(2, 46) === '7300000000000000000000000000000000000000003014') {
      // testing the following signature: PUSH20 00..00 ADDRESS EQ
      // in the context of a library, that slot contains the address of the library (pushed by the compiler to avoid calling library other than with a DELEGATECALL)
      // if code2 is not a library, well we still suppose that the comparison remain relevant even if we remove some information from `code1`
      code1 = replaceLibReference(code1, 4)
    }
    var pos = -1
    while ((pos = code2.search(/__(.*)__/)) !== -1) {
      code2 = replaceLibReference(code2, pos)
      code1 = replaceLibReference(code1, pos)
    }
    code1 = code1.replace(this.swarmHashExtraction(), '')
    code2 = code2.replace(this.swarmHashExtraction(), '')
    if (code1 && code2 && code1.indexOf(code2) === 0) {
      return true
    }
    return false
  },
  groupBy: groupBy,
  concatWithSeperator: concatWithSeperator,
  escapeRegExp: escapeRegExp
}

function replaceLibReference (code, pos) {
  return code.substring(0, pos) + '0000000000000000000000000000000000000000' + code.substring(pos + 40)
}

function buildCallPath (index, rootCall) {
  var ret = []
  findCallInternal(index, rootCall, ret)
  return ret
}

function findCall (index, rootCall) {
  var ret = buildCallPath(index, rootCall)
  return ret[ret.length - 1]
}

function findCallInternal (index, rootCall, callsPath) {
  var calls = Object.keys(rootCall.calls)
  var ret = rootCall
  callsPath.push(rootCall)
  for (var k in calls) {
    var subCall = rootCall.calls[calls[k]]
    if (index >= subCall.start && index <= subCall.return) {
      findCallInternal(index, subCall, callsPath)
      break
    }
  }
  return ret
}

/* util extracted out from remix-ide. @TODO split this file, cause it mix real util fn with solidity related stuff ... */
function groupBy (arr, key) {
  return arr.reduce((sum, item) => {
    const groupByVal = item[key]
    var groupedItems = sum[groupByVal] || []
    groupedItems.push(item)
    sum[groupByVal] = groupedItems
    return sum
  }, {})
}

function concatWithSeperator (list, seperator) {
  return list.reduce((sum, item) => sum + item + seperator, '').slice(0, -seperator.length)
}

function escapeRegExp (str) {
  return str.replace(/[-[\]/{}()+?.\\^$|]/g, '\\$&')
}
