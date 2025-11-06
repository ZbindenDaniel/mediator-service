$ npm start

> mediator-service@1.0.0 prestart
> npm run build


> mediator-service@1.0.0 prebuild
> node scripts/prebuild.js

[prebuild] Successfully compiled Sass to /home/user/repos/revamp-augmented-inventory/mediator-service/frontend/public/styles.css

> mediator-service@1.0.0 build
> tsc -p tsconfig.json && npm run bundle && node scripts/build.js

backend/actions/__tests__/forward-agentic-trigger.test.ts:147:5 - error TS2349: This expression is not callable.
  Type 'never' has no call signatures.

147     resolveInvocation?.({ ok: true });
        ~~~~~~~~~~~~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:12:19 - error TS2558: Expected 0-1 type arguments, but got 2.

12   invoke: jest.fn<InvokeReturn, InvokeArgs>().mockResolvedValue({ content: null })
                     ~~~~~~~~~~~~~~~~~~~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:17:9 - error TS2558: Expected 0-1 type arguments, but got 2.

17     .fn<ReturnType<SearchInvoker>, Parameters<SearchInvoker>>()
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:47:40 - error TS2558: Expected 0-1 type arguments, but got 2.

47     const applyAgenticResult = jest.fn<void, [AgenticResultPayload]>((payload) => {
                                          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:50:45 - error TS2558: Expected 0-1 type arguments, but got 2.

50     const markNotificationSuccess = jest.fn<void, [string]>();
                                               ~~~~~~~~~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:51:45 - error TS2558: Expected 0-1 type arguments, but got 2.

51     const markNotificationFailure = jest.fn<void, [string, string]>();
                                               ~~~~~~~~~~~~~~~~~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:52:40 - error TS2558: Expected 0-1 type arguments, but got 2.

52     const saveRequestPayload = jest.fn<void, [string, unknown]>();
                                          ~~~~~~~~~~~~~~~~~~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:61:13 - error TS2558: Expected 0-1 type arguments, but got 2.

61         .fn<Promise<ShopwareMatchResult | null>, [ShopwareMatchOptions]>()
               ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:76:11 - error TS2322: Type 'Mock<Promise<SearchResult>>' is not assignable to type 'SearchInvoker'.
  Types of parameters 'args' and 'query' are incompatible.
    Type '[query: string, limit: number, metadata?: SearchInvokerMetadata | undefined]' is not assignable to type 'never'.

76           searchInvoker,
             ~~~~~~~~~~~~~

  backend/agentic/flow/item-flow.ts:24:3
    24   searchInvoker: SearchInvoker;
         ~~~~~~~~~~~~~
    The expected type comes from property 'searchInvoker' which is declared here on type 'ItemFlowDependencies'

backend/agentic/__tests__/item-flow-dispatch.test.ts:77:62 - error TS2345: Argument of type '[AgenticResultPayload]' is not assignable to parameter of type 'never'.

77           applyAgenticResult: (result) => applyAgenticResult(result),
                                                                ~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:78:11 - error TS2322: Type 'Mock<void>' is not assignable to type '(itemId: string, payload: unknown) => void | Promise<void>'.
  Types of parameters 'args' and 'itemId' are incompatible.
    Type '[itemId: string, payload: unknown]' is not assignable to type 'never'.

78           saveRequestPayload,
             ~~~~~~~~~~~~~~~~~~

  backend/agentic/flow/item-flow.ts:28:3
    28   saveRequestPayload: (itemId: string, payload: unknown) => Promise<void> | void;
         ~~~~~~~~~~~~~~~~~~
    The expected type comes from property 'saveRequestPayload' which is declared here on type 'ItemFlowDependencies'

backend/agentic/__tests__/item-flow-dispatch.test.ts:79:11 - error TS2322: Type 'Mock<void>' is not assignable to type '(itemId: string) => void | Promise<void>'.
  Types of parameters 'args' and 'itemId' are incompatible.
    Type '[itemId: string]' is not assignable to type 'never'.

79           markNotificationSuccess,
             ~~~~~~~~~~~~~~~~~~~~~~~

  backend/agentic/flow/item-flow.ts:29:3
    29   markNotificationSuccess: (itemId: string) => Promise<void> | void;
         ~~~~~~~~~~~~~~~~~~~~~~~
    The expected type comes from property 'markNotificationSuccess' which is declared here on type 'ItemFlowDependencies'

backend/agentic/__tests__/item-flow-dispatch.test.ts:80:11 - error TS2322: Type 'Mock<void>' is not assignable to type '(itemId: string, errorMessage: string) => void | Promise<void>'.
  Types of parameters 'args' and 'itemId' are incompatible.
    Type '[itemId: string, errorMessage: string]' is not assignable to type 'never'.

80           markNotificationFailure
             ~~~~~~~~~~~~~~~~~~~~~~~

  backend/agentic/flow/item-flow.ts:30:3
    30   markNotificationFailure: (itemId: string, errorMessage: string) => Promise<void> | void;
         ~~~~~~~~~~~~~~~~~~~~~~~
    The expected type comes from property 'markNotificationFailure' which is declared here on type 'ItemFlowDependencies'

backend/agentic/__tests__/item-flow-dispatch.test.ts:95:11 - error TS2558: Expected 0-1 type arguments, but got 2.

95       .fn<Promise<void>, [AgenticResultPayload]>()
             ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:97:45 - error TS2558: Expected 0-1 type arguments, but got 2.

97     const markNotificationSuccess = jest.fn<void, [string]>();
                                               ~~~~~~~~~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:98:45 - error TS2558: Expected 0-1 type arguments, but got 2.

98     const markNotificationFailure = jest.fn<void, [string, string]>();
                                               ~~~~~~~~~~~~~~~~~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:99:40 - error TS2558: Expected 0-1 type arguments, but got 2.

99     const saveRequestPayload = jest.fn<void, [string, unknown]>();
                                          ~~~~~~~~~~~~~~~~~~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:108:13 - error TS2558: Expected 0-1 type arguments, but got 2.

108         .fn<Promise<ShopwareMatchResult | null>, [ShopwareMatchOptions]>()
                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:111:13 - error TS2740: Type '{ itemUUid: string; Artikelbeschreibung: string; }' is missing the following properties from type '{ Artikelbeschreibung: string; Kurzbeschreibung: string; Langtext: string; Hersteller: string; Länge_mm: number | null; Breite_mm: number | null; Höhe_mm: number | null; Gewicht_kg: number | null; itemUUid: string; Marktpreis: number | null; }': Kurzbeschreibung, Langtext, Hersteller, Länge_mm, and 4 more.

111             finalData: {
                ~~~~~~~~~

backend/agentic/__tests__/item-flow-dispatch.test.ts:131:13 - error TS2322: Type 'Mock<Promise<SearchResult>>' is not assignable to type 'SearchInvoker'.
  Types of parameters 'args' and 'query' are incompatible.
    Type '[query: string, limit: number, metadata?: SearchInvokerMetadata | undefined]' is not assignable to type 'never'.

131             searchInvoker,
                ~~~~~~~~~~~~~

  backend/agentic/flow/item-flow.ts:24:3
    24   searchInvoker: SearchInvoker;
         ~~~~~~~~~~~~~
    The expected type comes from property 'searchInvoker' which is declared here on type 'ItemFlowDependencies'

backend/agentic/__tests__/item-flow-dispatch.test.ts:132:13 - error TS2322: Type 'Mock<Promise<void>>' is not assignable to type '(payload: AgenticResultPayload) => void | Promise<void>'.
  Types of parameters 'args' and 'payload' are incompatible.
    Type '[payload: AgenticResultPayload]' is not assignable to type 'never'.

132             applyAgenticResult,
                ~~~~~~~~~~~~~~~~~~

  backend/agentic/flow/item-flow.ts:27:3
    27   applyAgenticResult?: (payload: AgenticResultPayload) => Promise<void> | void;
         ~~~~~~~~~~~~~~~~~~
    The expected type comes from property 'applyAgenticResult' which is declared here on type 'ItemFlowDependencies'

backend/agentic/__tests__/item-flow-dispatch.test.ts:133:13 - error TS2322: Type 'Mock<void>' is not assignable to type '(itemId: string, payload: unknown) => void | Promise<void>'.
  Types of parameters 'args' and 'itemId' are incompatible.
    Type '[itemId: string, payload: unknown]' is not assignable to type 'never'.

133             saveRequestPayload,
                ~~~~~~~~~~~~~~~~~~

  backend/agentic/flow/item-flow.ts:28:3
    28   saveRequestPayload: (itemId: string, payload: unknown) => Promise<void> | void;
         ~~~~~~~~~~~~~~~~~~
    The expected type comes from property 'saveRequestPayload' which is declared here on type 'ItemFlowDependencies'

backend/agentic/__tests__/item-flow-dispatch.test.ts:134:13 - error TS2322: Type 'Mock<void>' is not assignable to type '(itemId: string) => void | Promise<void>'.
  Types of parameters 'args' and 'itemId' are incompatible.
    Type '[itemId: string]' is not assignable to type 'never'.

134             markNotificationSuccess,
                ~~~~~~~~~~~~~~~~~~~~~~~

  backend/agentic/flow/item-flow.ts:29:3
    29   markNotificationSuccess: (itemId: string) => Promise<void> | void;
         ~~~~~~~~~~~~~~~~~~~~~~~
    The expected type comes from property 'markNotificationSuccess' which is declared here on type 'ItemFlowDependencies'

backend/agentic/__tests__/item-flow-dispatch.test.ts:135:13 - error TS2322: Type 'Mock<void>' is not assignable to type '(itemId: string, errorMessage: string) => void | Promise<void>'.
  Types of parameters 'args' and 'itemId' are incompatible.
    Type '[itemId: string, errorMessage: string]' is not assignable to type 'never'.

135             markNotificationFailure
                ~~~~~~~~~~~~~~~~~~~~~~~

  backend/agentic/flow/item-flow.ts:30:3
    30   markNotificationFailure: (itemId: string, errorMessage: string) => Promise<void> | void;
         ~~~~~~~~~~~~~~~~~~~~~~~
    The expected type comes from property 'markNotificationFailure' which is declared here on type 'ItemFlowDependencies'

backend/agentic/__tests__/result-handler.test.ts:8:58 - error TS2307: Cannot find module '../agentic' or its corresponding type declarations.

8 const mockAgenticModule = jest.requireMock<typeof import('../agentic')>('../agentic');
                                                           ~~~~~~~~~~~~

backend/agentic/__tests__/result-handler.test.ts:72:13 - error TS2322: Type '(fn: (...args: any[]) => void) => (...args: any[]) => void' is not assignable to type '<T extends (...args: any[]) => any>(fn: T) => (...args: Parameters<T>) => ReturnType<T>'.
  Call signature return types '(...args: any[]) => void' and '(...args: Parameters<T>) => ReturnType<T>' are incompatible.
    Type 'void' is not assignable to type 'ReturnType<T>'.

72             transaction: (fn: (...args: any[]) => void) => (...args: any[]) => fn(...args)
               ~~~~~~~~~~~

  backend/agentic/result-handler.ts:45:5
    45     transaction: <T extends (...args: any[]) => any>(fn: T) => (...args: Parameters<T>) => ReturnType<T>;
           ~~~~~~~~~~~
    The expected type comes from property 'transaction' which is declared here on type '{ transaction: <T extends (...args: any[]) => any>(fn: T) => (...args: Parameters<T>) => ReturnType<T>; }'

backend/agentic/__tests__/result-handler.test.ts:80:11 - error TS2322: Type '() => { UUID: string; Search: string; }' is not assignable to type '(requestId: string) => AgenticRequestLog | null'.
  Type '{ UUID: string; Search: string; }' is missing the following properties from type 'AgenticRequestLog': Status, Error, CreatedAt, UpdatedAt, and 3 more.

80           getAgenticRequestLog: () => requestLog
             ~~~~~~~~~~~~~~~~~~~~

  backend/agentic/result-handler.ts:59:3
    59   getAgenticRequestLog?: (requestId: string) => AgenticRequestLog | null;
         ~~~~~~~~~~~~~~~~~~~~
    The expected type comes from property 'getAgenticRequestLog' which is declared here on type 'AgenticResultHandlerContext'

backend/agentic/__tests__/tavily-client.test.ts:26:34 - error TS2345: Argument of type '{ foo: string; }' is not assignable to parameter of type 'never'.

26     searchMock.mockResolvedValue({ foo: 'bar' });
                                    ~~~~~~~~~~~~~~

backend/agentic/__tests__/think-tag-parsing.test.ts:66:48 - error TS2345: Argument of type '{ llm: StubChatModel; logger: ExtractionLogger; itemId: "item-123"; maxAttempts: 1; maxAgentSearchesPerRequest: 1; searchContexts: readonly [{ readonly query: "seed"; readonly text: "context"; readonly sources: readonly []; }]; ... 6 more ...; searchInvoker: Mock<...>; }' is not assignable to parameter of type 'RunExtractionOptions'.
  Types of property 'searchContexts' are incompatible.
    The type 'readonly [{ readonly query: "seed"; readonly text: "context"; readonly sources: readonly []; }]' is 'readonly' and cannot be assigned to the mutable type '{ query: string; text: string; sources: SearchSource[]; }[]'.

66     const result = await runExtractionAttempts({
                                                  ~
67       ...extractionOptions,
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~
68       llm
   ~~~~~~~~~
69     });
   ~~~~~

backend/agentic/__tests__/think-tag-parsing.test.ts:83:48 - error TS2345: Argument of type '{ llm: StubChatModel; logger: ExtractionLogger; itemId: "item-123"; maxAttempts: 1; maxAgentSearchesPerRequest: 1; searchContexts: readonly [{ readonly query: "seed"; readonly text: "context"; readonly sources: readonly []; }]; ... 6 more ...; searchInvoker: Mock<...>; }' is not assignable to parameter of type 'RunExtractionOptions'.
  Types of property 'searchContexts' are incompatible.
    The type 'readonly [{ readonly query: "seed"; readonly text: "context"; readonly sources: readonly []; }]' is 'readonly' and cannot be assigned to the mutable type '{ query: string; text: string; sources: SearchSource[]; }[]'.

83     const result = await runExtractionAttempts({
                                                  ~
84       ...extractionOptions,
   ~~~~~~~~~~~~~~~~~~~~~~~~~~~
85       llm
   ~~~~~~~~~
86     });
   ~~~~~

backend/agentic/invoker.ts:121:41 - error TS2339: Property 'invoke' does not exist on type 'ChatOllama'.

121           const response = await client.invoke(messages);
                                            ~~~~~~


Found 31 errors in 6 files.

Errors  Files
     1  backend/actions/__tests__/forward-agentic-trigger.test.ts:147
    23  backend/agentic/__tests__/item-flow-dispatch.test.ts:12
     3  backend/agentic/__tests__/result-handler.test.ts:8
     1  backend/agentic/__tests__/tavily-client.test.ts:26
     2  backend/agentic/__tests__/think-tag-parsing.test.ts:66
     1  backend/agentic/invoker.ts:121
npm error Lifecycle script `build` failed with error:
npm error code 2
npm error path /home/user/repos/revamp-augmented-inventory/mediator-service
npm error workspace mediator-service@1.0.0
npm error location /home/user/repos/revamp-augmented-inventory/mediator-service
npm error command failed
npm error command sh -c tsc -p tsconfig.json && npm run bundle && node scripts/build.js
npm error Lifecycle script `start` failed with error:
npm error code 2
npm error path /home/user/repos/revamp-augmented-inventory/mediator-service
npm error workspace mediator-service@1.0.0
npm error location /home/user/repos/revamp-augmented-inventory/mediator-service
npm error command failed
npm error command sh -c npm run build