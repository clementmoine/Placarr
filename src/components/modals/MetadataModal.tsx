import * as z from "zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ItemCarousel } from "@/components/ItemCarousel";

import { useDebounce } from "@/lib/hooks/useDebounce";

import type { Type } from "@prisma/client";
import type { MetadataWithIncludes } from "@/types/metadata";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

type MetadataModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
  onPreview: (name: string) => Promise<void>;
  currentName: string;
  type: Type;
  metadata: MetadataWithIncludes | null;
  isFetching: boolean;
};

export function MetadataModal({
  isOpen,
  onClose,
  onSubmit,
  onPreview,
  currentName,
  metadata,
  isFetching,
}: MetadataModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const debounce = useDebounce(1000);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: currentName,
    },
  });

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);

    try {
      await onSubmit(values.name);
      onClose();
    } catch (error) {
      console.error("Error submitting form:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      onPreview(currentName);
    }

    form.reset();
  }, [currentName, form, isOpen, onPreview]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="flex flex-col p-0 overflow-hidden bg-background text-foreground gap-0 max-h-[90vh]">
        <DialogHeader className="p-4 border-b shrink-0">
          <DialogTitle className="text-foreground">Find Metadata</DialogTitle>
          <DialogDescription className="text-foreground">
            Find images and details to complete the item.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="flex flex-col overflow-hidden"
          >
            <div className="overflow-x-hidden overflow-y-auto flex flex-col space-y-4 p-4 max-h-[60vh]">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">
                      Search from name
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Enter a name"
                        className="bg-background text-foreground"
                        onChange={(e) => {
                          field.onChange(e);
                          debounce(() => onPreview(e.target.value));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isFetching ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : metadata ? (
                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-4">
                    <div className="flex gap-6 items-center">
                      {/* Image or Carousel */}
                      <div className="flex w-24 shrink-0 overflow-hidden">
                        <ItemCarousel
                          max={3}
                          item={{
                            metadata,
                          }}
                        />
                      </div>

                      <div className="space-y-3 min-w-0 flex-1">
                        {/* Title */}
                        <div className="space-y-1">
                          <h4 className="text-sm font-medium text-muted-foreground">
                            Title
                          </h4>
                          <p className="text-foreground font-medium">
                            {metadata.title}
                          </p>
                        </div>

                        {/* Release Date */}
                        {metadata.releaseDate && (
                          <div className="space-y-1">
                            <h4 className="text-sm font-medium text-muted-foreground">
                              Release Date
                            </h4>
                            <p className="text-foreground">
                              {new Date(
                                metadata.releaseDate,
                              ).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              })}
                            </p>
                          </div>
                        )}

                        {/* Authors */}
                        {metadata.authors && metadata.authors.length > 0 && (
                          <div className="space-y-1">
                            <h4 className="text-sm font-medium text-muted-foreground">
                              Authors
                            </h4>
                            <p className="text-foreground text-sm">
                              {metadata.authors
                                .map((author) => author.name)
                                .join(", ")}
                            </p>
                          </div>
                        )}

                        {/* Publishers */}
                        {metadata.publishers &&
                          metadata.publishers.length > 0 && (
                            <div className="space-y-1">
                              <h4 className="text-sm font-medium text-muted-foreground">
                                Publishers
                              </h4>
                              <p className="text-foreground text-sm">
                                {metadata.publishers
                                  .map((publisher) => publisher.name)
                                  .join(", ")}
                              </p>
                            </div>
                          )}

                        {/* Description */}
                        {metadata.description && (
                          <div className="space-y-1">
                            <h4 className="text-sm font-medium text-muted-foreground">
                              Description
                            </h4>
                            <p className="text-foreground whitespace-pre-wrap break-words text-sm leading-relaxed line-clamp-3">
                              {metadata.description}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter className="p-4 border-t shrink-0">
              <Button type="button" onClick={onClose} variant="secondary">
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                Update Metadata
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
