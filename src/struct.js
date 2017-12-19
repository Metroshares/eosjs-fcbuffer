const ByteBuffer = require('bytebuffer')

/**
  @class Struct

  @arg {object} config.override = {
    'Message.data.appendByteBuffer': ({fields, object, b}) => {..}
  }
  Rare cases where specialized serilization is needed (ex A Message object has
  'type' and 'data' fields where object.type === 'transfer' can define
  serialization time Struct needed for 'data' .. This saves complexity for the
  end-user's working with json.  See override unit test.
*/
module.exports = (name, config = {debug: false}) => {
  config = Object.assign({override: {}}, config)
  const fields = {}
  let fieldOne, fieldOneName

  return {
    compare (a, b) {
      if(!fieldOne || !fieldOne.compare) {
        return 0
      }

      const v1 = a[fieldOneName]
      const v2 = b[fieldOneName]

      return fieldOne.compare(v1, v2)
    },

    /** @private */
    add (fieldName, type) {
      fields[fieldName] = type
      if(fieldOne == null) {
        fieldOne = type
        fieldOneName = fieldName
      }
    },

    fromByteBuffer (b) {
      let object = {}
      let field = null
      try {
        for (field in fields) {
          const type = fields[field]
          try {
            const o1 = b.offset
            if (field === '') {
              // structPtr
              object = type.fromByteBuffer(b, config)
            } else {
              const fromByteBuffer = config.override[`${name}.${field}.fromByteBuffer`]
              if(fromByteBuffer) {
                fromByteBuffer({fields, object, b, config})
              } else {
                object[field] = type.fromByteBuffer(b, config)
              }
            }
            if (config.debug) {
              if (type.struct) {
                console.error(type.struct)
              } else {
                const _b = b.copy(o1, b.offset)
                console.error(
                  `${name}.${field}\t`,
                  _b.toHex(),
                  '(fromByteBuffer)'
                )
              }
            }
          } catch (e) {
            e.message += ` (${name}.${field})`
            console.error(`Error reading ${name}.${field} in data:`)
            b.printDebug()
            throw e
          }
        }
      } catch (error) {
        error.message += ` ${name}.${field}`
        throw error
      }
      return object
    },

    appendByteBuffer (b, object) {
      let field = null
      try {
        for (field in fields) {
          const type = fields[field]
          if (field === '') {
            // structPtr
            type.appendByteBuffer(b, object)
          } else {
            const appendByteBuffer = config.override[`${name}.${field}.appendByteBuffer`]
            if(appendByteBuffer) {
              appendByteBuffer({fields, object, b})
            } else {
              type.appendByteBuffer(b, object[field])
            }
          }
        }
      } catch (error) {
        try {
          error.message += ' ' + name + '.' + field + ' = ' + JSON.stringify(object[field])
        } catch (e) { // circular ref
          error.message += ' ' + name + '.' + field + ' = ' + object[field]
        }
        throw error
      }
    },

    fromObject (serializedObject) {
      const fromObject_struct = config.override[`${name}.fromObject`]
      if(fromObject_struct) {
        const ret = fromObject_struct(serializedObject)
        if(ret != null) {
          return ret
        }
      }

      let result = {}
      let field = null
      try {
        for (field in fields) {
          // if(config.debug) {
          //   console.error(name, field, '(fromObject)')
          // }
          const type = fields[field]
          if (field === '') {
            // structPtr
            const object = type.fromObject(serializedObject)
            result = Object.assign(result, object)
          } else {
            const fromObject = config.override[`${name}.${field}.fromObject`]
            if(fromObject) {
              fromObject({fields, object: serializedObject, result})
            } else {
              const value = serializedObject[field]
              const object = type.fromObject(value)
              result[field] = object
            }
          }
        }
      } catch (error) {
        error.message += ' ' + name + '.' + field
        throw error
      }

      return result
    },

    toObject (serializedObject = {}) {
      const toObject_struct = config.override[`${name}.toObject`]
      if(toObject_struct) {
        const ret = toObject_struct(serializedObject)
        if(ret != null) {
          return ret
        }
      }

      let result = {}
      let field = null
      try {
        // if (!fields) { return result }

        for (field in fields) {
          const type = fields[field]

          const toObject = config.override[`${name}.${field}.toObject`]
          if(toObject) {
            toObject({fields, object: serializedObject, result, config})
          } else {
            const object = type.toObject(serializedObject ? serializedObject[field] : null, config)
            if (field === '') {
              // structPtr
              result = Object.assign(result, object)
            } else {
              result[field] = object
            }
          }

          if (config.debug) {
            try {
              let b = new ByteBuffer(ByteBuffer.DEFAULT_CAPACITY, ByteBuffer.LITTLE_ENDIAN)
              if (serializedObject != null) {
                const value = serializedObject[field]
                if (value) {
                  const appendByteBuffer = config.override[`${name}.${field}.appendByteBuffer`]
                  if(toObject && appendByteBuffer) {
                    appendByteBuffer({fields, object: serializedObject, b})
                  } else {
                    type.appendByteBuffer(b, value)
                  }
                }
              }
              b = b.copy(0, b.offset)
              console.error(name + '.' + field, b.toHex(), '(toObject)')
            } catch(error) { // work-around to prevent debug time crash
              error.message = `${name}.${field} ${error.message}`
              console.error(error)
            }
          }
        }
      } catch (error) {
        error.message += ' ' + name + '.' + field
        throw error
      }
      return result
    }
  }
}
