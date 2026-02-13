export interface Env {
  CRM_API_TOKEN: string;
  CRM_BASE_URL: string;
  WEBHOOK_SECRET: string;
}

type ConvosoLead = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  phone_code?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  source_name?: string;
  user_name?: string;
  owner_name?: string;
  campaign_name?: string;
  address1?: string;
  address2?: string;
  notes?: string;
  field_101?: string;
  gender?: string;
  date_of_birth?: string;
  status?: string;
  status_name?: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }

    if (request.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const url = new URL(request.url);

    // Validate shared secret (header or query param)
    const secret =
      request.headers.get("x-webhook-secret") ||
      url.searchParams.get("secret");
    if (secret !== env.WEBHOOK_SECRET) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (url.pathname === "/lead") {
      return handleLead(request, env);
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function handleLead(request: Request, env: Env): Promise<Response> {
  const lead = await parseBody(request);
  console.log("Incoming lead payload:", JSON.stringify(lead));
  if (!lead.phone_number && !lead.email) {
    return Response.json(
      { error: "phone_number or email is required" },
      { status: 400 },
    );
  }

  const phone = normalizePhone(lead.phone_number, lead.phone_code);

  try {
    // Look up lead source by name if provided
    let leadSourceId: string | null = null;
    if (lead.source_name) {
      leadSourceId = await findLeadSourceByName(env, lead.source_name);
    }

    // Look up agent profile — prefer owner (reassigned agent), fall back to user (current agent)
    let agentProfileId: string | null = null;
    const agentName = lead.owner_name || lead.user_name;
    if (agentName) {
      agentProfileId = await findAgentProfileByName(env, agentName);
    }

    // Check for existing person by phone
    let existingPersonId: string | null = null;
    if (phone) {
      existingPersonId = await findPersonByPhone(env, phone.number);
    }

    // Build person input
    const personInput = buildPersonInput(
      lead,
      phone,
      leadSourceId,
      agentProfileId,
    );

    let result;
    if (existingPersonId) {
      result = await updatePerson(env, existingPersonId, personInput);
    } else {
      result = await createPerson(env, personInput);
    }

    // Create a Note if the person doesn't have any yet
    if (lead.notes) {
      const hasNotes = await personHasNotes(env, result.id);
      if (!hasNotes) {
        await createNoteForPerson(env, result.id, lead.notes);
      }
    }

    return Response.json({
      success: true,
      action: existingPersonId ? "updated" : "created",
      personId: result.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Lead sync failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}

// Parse form-encoded or JSON body from Convoso
async function parseBody(request: Request): Promise<ConvosoLead> {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return request.json();
  }
  // Form-encoded (Convoso default)
  const text = await request.text();
  const params = new URLSearchParams(text);
  const lead: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    lead[key] = value;
  }
  return lead as unknown as ConvosoLead;
}

// Strip literal "null" strings and trim whitespace
function sanitize(value?: string): string {
  if (!value || value === "null" || value === "NULL") return "";
  return value.trim();
}

type PhoneInfo = {
  number: string;
  callingCode: string;
  countryCode: string;
};

function normalizePhone(phone?: string, phoneCode?: string): PhoneInfo | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const callingCode = phoneCode ? `+${phoneCode}` : "+1";
  // Strip country code prefix if present in the number
  if (digits.length === 11 && digits.startsWith(phoneCode || "1")) {
    return { number: digits.slice((phoneCode || "1").length), callingCode, countryCode: "US" };
  }
  return { number: digits, callingCode, countryCode: "US" };
}

function buildPersonInput(
  lead: ConvosoLead,
  phone: PhoneInfo | null,
  leadSourceId: string | null,
  agentProfileId: string | null,
): Record<string, unknown> {
  const input: Record<string, unknown> = {
    name: {
      firstName: lead.first_name || "",
      lastName: lead.last_name || "",
    },
  };

  if (lead.email) {
    input.emails = {
      primaryEmail: lead.email,
    };
  }

  if (phone) {
    input.phones = {
      primaryPhoneNumber: phone.number,
      primaryPhoneCallingCode: phone.callingCode,
      primaryPhoneCountryCode: phone.countryCode,
    };
  }

  const address1 = sanitize(lead.address1);
  if (address1 || lead.city || lead.state || lead.postal_code) {
    input.addressCustom = {
      addressStreet1: address1,
      addressCity: sanitize(lead.city),
      addressState: sanitize(lead.state),
      addressPostcode: sanitize(lead.postal_code),
    };
  }

  // Notes are a separate object in the CRM (Note + NoteTarget), not a Person field.
  // TODO: create Note linked to Person if lead.notes is present.

  const gender = sanitize(lead.gender);
  if (gender) {
    input.gender = gender.toUpperCase();
  }

  if (lead.date_of_birth) {
    input.dateOfBirth = new Date(lead.date_of_birth).toISOString();
  }

  if (leadSourceId) {
    input.leadSourceId = leadSourceId;
  }

  if (agentProfileId) {
    input.agentProfileId = agentProfileId;
  }

  return input;
}

// CRM GraphQL helper
async function crmQuery(
  env: Env,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(`${env.CRM_BASE_URL}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.CRM_API_TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`CRM API error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as {
    data?: Record<string, unknown>;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new Error(`CRM GraphQL error: ${json.errors[0].message}`);
  }

  return json.data!;
}

async function findPersonByPhone(
  env: Env,
  phone: string,
): Promise<string | null> {
  const query = `
    query FindPersonByPhone($filter: PersonFilterInput) {
      people(filter: $filter, first: 1) {
        edges {
          node {
            id
          }
        }
      }
    }
  `;

  const data = await crmQuery(env, query, {
    filter: {
      phones: {
        primaryPhoneNumber: {
          eq: phone,
        },
      },
    },
  });

  const people = data.people as {
    edges: Array<{ node: { id: string } }>;
  };

  return people.edges.length > 0 ? people.edges[0].node.id : null;
}

async function findLeadSourceByName(
  env: Env,
  name: string,
): Promise<string | null> {
  const query = `
    query FindLeadSource($filter: LeadSourceFilterInput) {
      leadSources(filter: $filter, first: 1) {
        edges {
          node {
            id
          }
        }
      }
    }
  `;

  try {
    const data = await crmQuery(env, query, {
      filter: { name: { eq: name } },
    });

    const sources = data.leadSources as {
      edges: Array<{ node: { id: string } }>;
    };

    return sources.edges.length > 0 ? sources.edges[0].node.id : null;
  } catch {
    // Lead Source object may not exist yet; skip silently
    return null;
  }
}

async function findAgentProfileByName(
  env: Env,
  name: string,
): Promise<string | null> {
  const query = `
    query FindAgentProfile($filter: AgentProfileFilterInput) {
      agentProfiles(filter: $filter, first: 1) {
        edges {
          node {
            id
          }
        }
      }
    }
  `;

  try {
    const data = await crmQuery(env, query, {
      filter: { name: { like: `%${name}%` } },
    });

    const profiles = data.agentProfiles as {
      edges: Array<{ node: { id: string } }>;
    };

    return profiles.edges.length > 0 ? profiles.edges[0].node.id : null;
  } catch {
    // Agent Profile object may not exist yet; skip silently
    return null;
  }
}

async function createPerson(
  env: Env,
  input: Record<string, unknown>,
): Promise<{ id: string }> {
  const query = `
    mutation CreatePerson($input: PersonCreateInput!) {
      createPerson(data: $input) {
        id
      }
    }
  `;

  const data = await crmQuery(env, query, { input });
  return data.createPerson as { id: string };
}

async function updatePerson(
  env: Env,
  id: string,
  input: Record<string, unknown>,
): Promise<{ id: string }> {
  const query = `
    mutation UpdatePerson($id: UUID!, $input: PersonUpdateInput!) {
      updatePerson(id: $id, data: $input) {
        id
      }
    }
  `;

  const data = await crmQuery(env, query, { id, input });
  return data.updatePerson as { id: string };
}

async function personHasNotes(
  env: Env,
  personId: string,
): Promise<boolean> {
  const query = `
    query PersonNotes($filter: NoteTargetFilterInput) {
      noteTargets(filter: $filter, first: 1) {
        edges {
          node {
            id
          }
        }
      }
    }
  `;

  const data = await crmQuery(env, query, {
    filter: { targetPersonId: { eq: personId } },
  });

  const targets = data.noteTargets as {
    edges: Array<{ node: { id: string } }>;
  };

  return targets.edges.length > 0;
}

async function createNoteForPerson(
  env: Env,
  personId: string,
  noteText: string,
): Promise<void> {
  // Create the Note
  const noteQuery = `
    mutation CreateNote($input: NoteCreateInput!) {
      createNote(data: $input) {
        id
      }
    }
  `;

  const noteData = await crmQuery(env, noteQuery, {
    input: {
      title: "Convoso Notes",
      bodyV2: { markdown: noteText },
    },
  });

  const noteId = (noteData.createNote as { id: string }).id;

  // Link Note to Person via NoteTarget
  const targetQuery = `
    mutation CreateNoteTarget($input: NoteTargetCreateInput!) {
      createNoteTarget(data: $input) {
        id
      }
    }
  `;

  await crmQuery(env, targetQuery, {
    input: {
      noteId,
      targetPersonId: personId,
    },
  });
}
