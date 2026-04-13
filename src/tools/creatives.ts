/**
 * Creative asset management — upload images/videos, manage ad creatives.
 * Supports direct file upload and Google Drive link processing.
 */

import { z } from "zod";
import { readFile } from "fs/promises";
import type { LinkedInClient } from "../linkedin/client.js";

// ─── Schemas ────────────────────────────────────────────────────────

export const UploadImageSchema = z.object({
  filePath: z
    .string()
    .optional()
    .describe("Local file path to the image"),
  googleDriveUrl: z
    .string()
    .optional()
    .describe("Google Drive shareable link (file must be publicly accessible or service account has access)"),
  fileName: z.string().default("upload.png").describe("File name for the asset"),
});

export const CreateSponsoredPostSchema = z.object({
  commentary: z.string().describe("Ad copy / post text"),
  imageAssetUrn: z
    .string()
    .optional()
    .describe("Image asset URN from upload_image (e.g. urn:li:digitalmediaAsset:XXX)"),
  landingPageUrl: z
    .string()
    .optional()
    .describe("Click-through URL for the ad"),
  title: z
    .string()
    .optional()
    .describe("Link preview title (shown below image)"),
  description: z
    .string()
    .optional()
    .describe("Link preview description"),
});

export const CreateAdCreativeSchema = z.object({
  campaignId: z.string().describe("Campaign URN"),
  type: z
    .enum(["SINGLE_IMAGE", "VIDEO", "CAROUSEL", "MESSAGE", "CONVERSATION"])
    .default("SINGLE_IMAGE"),
  commentary: z.string().describe("Ad copy / post text"),
  assetUrn: z.string().optional().describe("Image or video asset URN"),
  destinationUrl: z.string().optional().describe("Click-through URL"),
  callToAction: z
    .enum([
      "APPLY",
      "DOWNLOAD",
      "GET_QUOTE",
      "LEARN_MORE",
      "SIGN_UP",
      "SUBSCRIBE",
      "REGISTER",
      "JOIN",
      "REQUEST_DEMO",
    ])
    .default("LEARN_MORE"),
});

// ─── Handlers ───────────────────────────────────────────────────────

export function registerCreativeTools(client: LinkedInClient) {
  return {
    upload_image: {
      description:
        "Upload an image to the LinkedIn media library from a local file or Google Drive link.",
      schema: UploadImageSchema,
      handler: async (args: z.infer<typeof UploadImageSchema>) => {
        if (!args.filePath && !args.googleDriveUrl) {
          return { error: "Provide either filePath or googleDriveUrl" };
        }

        // 1. Get the file bytes
        let fileBytes: Buffer;
        if (args.filePath) {
          fileBytes = await readFile(args.filePath);
        } else {
          // Convert Drive share link to direct download
          const directUrl = convertGDriveToDirectLink(args.googleDriveUrl!);
          const res = await fetch(directUrl);
          if (!res.ok) {
            return {
              error: `Failed to download from Google Drive: ${res.status} ${res.statusText}. Ensure the file is publicly shared or the service account has access.`,
            };
          }
          fileBytes = Buffer.from(new Uint8Array(await res.arrayBuffer()));
        }

        // 2. Register the upload with LinkedIn
        const registerRes = await client.post<{
          value: {
            uploadMechanism: {
              "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
                uploadUrl: string;
                headers: Record<string, string>;
              };
            };
            asset: string;
          };
        }>("/assets?action=registerUpload", {
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            owner: client.config.adAccountId,
            serviceRelationships: [
              {
                relationshipType: "OWNER",
                identifier: "urn:li:userGeneratedContent",
              },
            ],
          },
        });

        const uploadInfo =
          registerRes.data.value.uploadMechanism[
            "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
          ];
        const assetUrn = registerRes.data.value.asset;

        // 3. Upload binary to the provided URL
        await fetch(uploadInfo.uploadUrl, {
          method: "PUT",
          headers: {
            ...uploadInfo.headers,
            "Content-Type": "application/octet-stream",
          },
          body: new Uint8Array(fileBytes),
        });

        // 4. Poll until processing completes (max 30s)
        const assetId = assetUrn.split(":").pop()!;
        let status = "PROCESSING";
        for (let i = 0; i < 15 && status === "PROCESSING"; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          const check = await client.get<{ recipes: Array<{ status: string }> }>(
            `/assets/${assetId}`
          );
          status = check.data.recipes?.[0]?.status || "UNKNOWN";
        }

        return {
          assetUrn,
          status,
          fileName: args.fileName,
        };
      },
    },

    upload_video: {
      description:
        "Register a video upload to the LinkedIn media library. Returns upload URLs for multipart upload.",
      schema: z.object({
        fileSizeBytes: z.number().describe("Total file size in bytes"),
        fileName: z.string().default("video.mp4"),
      }),
      handler: async (args: { fileSizeBytes: number; fileName: string }) => {
        const res = await client.post("/assets?action=registerUpload", {
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:ads-video"],
            owner: client.config.adAccountId,
            serviceRelationships: [
              {
                relationshipType: "OWNER",
                identifier: "urn:li:userGeneratedContent",
              },
            ],
            supportedUploadMechanism: ["MULTIPART_UPLOAD"],
            fileSize: args.fileSizeBytes,
          },
        });
        return res.data;
      },
    },

    create_sponsored_post: {
      description:
        "Create a sponsored post (dark post) for use as ad content. " +
        "This post won't appear in the org's feed — it's only used as ad creative. " +
        "Returns a share URN to pass to create_ad_creative. " +
        "REQUIRES w_organization_social OAuth scope — if you get ACCESS_DENIED, " +
        "add this scope to your LinkedIn app and re-authorize.",
      schema: CreateSponsoredPostSchema,
      handler: async (args: z.infer<typeof CreateSponsoredPostSchema>) => {
        // Get the organization from the ad account
        const accountRes = await client.get<{ reference: string }>(
          `/adAccounts/${client.config.adAccountId.includes(":") ? client.config.adAccountId.split(":").pop()! : client.config.adAccountId}`
        );
        const orgUrn = (accountRes.data as Record<string, unknown>).reference as string;

        // Build the post payload
        const body: Record<string, unknown> = {
          author: orgUrn,
          commentary: args.commentary,
          visibility: "PUBLIC",
          distribution: {
            feedDistribution: "NONE",
          },
          lifecycleState: "PUBLISHED",
          adContext: {
            dscAdAccount: client.config.adAccountId,
            dscAdType: "SPONSORED",
            isDsc: true,
          },
        };

        // Add image/article content if provided
        if (args.imageAssetUrn || args.landingPageUrl) {
          const article: Record<string, unknown> = {};
          if (args.landingPageUrl) article.source = args.landingPageUrl;
          if (args.title) article.title = args.title;
          if (args.description) article.description = args.description;
          if (args.imageAssetUrn) article.thumbnail = args.imageAssetUrn;
          body.content = { article };
        }

        // Use the versioned Posts API
        const res = await client.post("/posts", body);
        const resData = res.data as Record<string, unknown>;

        return {
          shareUrn: resData._location || null,
          organization: orgUrn,
          _usage:
            "Pass the shareUrn as 'assetUrn' when calling create_ad_creative " +
            "to link this post to a campaign.",
        };
      },
    },

    create_full_ad: {
      description:
        "End-to-end ad creation: upload image + create dark post + create ad creative. " +
        "Combines upload_image, create_sponsored_post, and create_ad_creative into one call. " +
        "REQUIRES w_organization_social OAuth scope for post creation.",
      schema: z.object({
        campaignId: z.string().describe("Campaign URN to attach the ad to"),
        commentary: z.string().describe("Ad copy / post text"),
        imagePath: z
          .string()
          .optional()
          .describe("Local file path to ad image"),
        googleDriveUrl: z
          .string()
          .optional()
          .describe("Google Drive shareable link to ad image"),
        landingPageUrl: z
          .string()
          .optional()
          .describe("Click-through URL"),
        title: z
          .string()
          .optional()
          .describe("Link preview title"),
        callToAction: z
          .enum(["APPLY", "DOWNLOAD", "GET_QUOTE", "LEARN_MORE", "SIGN_UP", "SUBSCRIBE", "REGISTER", "JOIN", "REQUEST_DEMO"])
          .default("REGISTER"),
        leadgenFormUrn: z
          .string()
          .optional()
          .describe("Lead gen form URN (e.g. urn:li:adForm:2875996)"),
      }),
      handler: async (args: {
        campaignId: string;
        commentary: string;
        imagePath?: string;
        googleDriveUrl?: string;
        landingPageUrl?: string;
        title?: string;
        callToAction: string;
        leadgenFormUrn?: string;
      }) => {
        const steps: Record<string, unknown> = {};

        // Step 1: Upload image (if provided)
        let imageAssetUrn: string | undefined;
        if (args.imagePath || args.googleDriveUrl) {
          const uploadResult = await registerCreativeTools(client).upload_image.handler({
            filePath: args.imagePath,
            googleDriveUrl: args.googleDriveUrl,
            fileName: "ad-image.png",
          });
          if ("error" in uploadResult) {
            return { error: `Image upload failed: ${(uploadResult as { error: string }).error}`, step: "upload_image" };
          }
          imageAssetUrn = (uploadResult as { assetUrn: string }).assetUrn;
          steps.upload = uploadResult;
        }

        // Step 2: Create sponsored post (dark post)
        const postResult = await registerCreativeTools(client).create_sponsored_post.handler({
          commentary: args.commentary,
          imageAssetUrn,
          landingPageUrl: args.landingPageUrl,
          title: args.title,
        });
        if ("error" in postResult) {
          return { error: `Post creation failed: ${(postResult as { error: string }).error}`, step: "create_sponsored_post", steps };
        }
        const shareUrn = String((postResult as Record<string, unknown>).shareUrn || "");
        steps.post = postResult;

        // Step 3: Create ad creative
        const creativeBody: Record<string, unknown> = {
          campaign: args.campaignId,
          intendedStatus: "DRAFT",
          content: { reference: shareUrn },
        };
        if (args.leadgenFormUrn || args.callToAction) {
          creativeBody.leadgenCallToAction = {
            ...(args.leadgenFormUrn ? { destination: args.leadgenFormUrn } : {}),
            label: args.callToAction,
          };
        }
        const creativePath = client.accountPath("/creatives");
        const creativeRes = await client.post(creativePath, creativeBody);
        steps.creative = creativeRes.data;

        return {
          success: true,
          shareUrn,
          creativeId: (creativeRes.data as Record<string, unknown>)._location,
          campaignId: args.campaignId,
          steps,
        };
      },
    },

    list_creatives: {
      description: "List ad creatives, optionally filtered by campaign.",
      schema: z.object({
        campaignId: z.string().optional(),
      }),
      handler: async (args: { campaignId?: string }) => {
        const params: Record<string, string> = {
          q: "criteria",
        };
        if (args.campaignId) {
          params["campaigns"] = `List(${encodeURIComponent(args.campaignId)})`;
        }
        const path = client.accountPath("/creatives");
        const res = await client.get(path, params);
        return res.data;
      },
    },

    create_ad_creative: {
      description:
        "Create an ad creative and associate it with a campaign. " +
        "For sponsored content ads, first create a share/post and pass its URN as contentReference. " +
        "For lead gen, also provide leadgenFormUrn and callToAction.",
      schema: CreateAdCreativeSchema,
      handler: async (args: z.infer<typeof CreateAdCreativeSchema>) => {
        const body: Record<string, unknown> = {
          campaign: args.campaignId,
          intendedStatus: "DRAFT",
        };

        // Content reference — points to a share, InMail content, or other entity
        if (args.assetUrn) {
          body.content = { reference: args.assetUrn };
        }

        // Lead gen call-to-action (for lead gen campaigns, use leadgenCallToAction)
        if (args.destinationUrl || args.callToAction) {
          body.leadgenCallToAction = {
            ...(args.destinationUrl ? { destination: args.destinationUrl } : {}),
            ...(args.callToAction ? { label: args.callToAction } : {}),
          };
        }

        // Commentary (ad copy) — only accepted as part of the share, not on the creative itself
        // Store it in the response for reference
        const path = client.accountPath("/creatives");
        const res = await client.post(path, body);
        return {
          ...res.data as Record<string, unknown>,
          _note: args.commentary
            ? "Commentary text is set on the share/post, not the creative. " +
              "Use the content reference to manage ad copy."
            : undefined,
        };
      },
    },

    get_creative: {
      description: "Get details of a single creative by ID.",
      schema: z.object({ id: z.string() }),
      handler: async (args: { id: string }) => {
        const path = client.accountPath(`/creatives/${encodeURIComponent(args.id)}`);
        const res = await client.get(path);
        return res.data;
      },
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function convertGDriveToDirectLink(shareUrl: string): string {
  // Convert https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // to     https://drive.google.com/uc?export=download&id=FILE_ID
  const match = shareUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  // If it's already a direct link or unrecognized format, return as-is
  return shareUrl;
}
