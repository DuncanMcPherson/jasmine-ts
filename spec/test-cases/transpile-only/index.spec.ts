// tslint:disable-next-line:class-name
interface testInterface {
  prop1: string;
}

describe('simple-ts-file', () => {
  it('should work', () => {
    const testInstance: testInterface = {
    // @ts-ignore
      prop1: 1
    }

    // @ts-ignore
    expect(testInstance.prop1).toBe(1)
  })
})
