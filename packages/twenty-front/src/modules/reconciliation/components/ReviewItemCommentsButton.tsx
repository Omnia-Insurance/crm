import { useTasks } from '@/activities/tasks/hooks/useTasks';
import { type Task } from '@/activities/types/Task';
import { getFirstNonEmptyLineOfRichText } from '@/blocknote-editor/utils/getFirstNonEmptyLineOfRichText';
import { parseInitialBlocknote } from '@/blocknote-editor/utils/parseInitialBlocknote';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { Dropdown } from '@/ui/layout/dropdown/components/Dropdown';
import { DropdownMenuItemsContainer } from '@/ui/layout/dropdown/components/DropdownMenuItemsContainer';
import { DropdownMenuSeparator } from '@/ui/layout/dropdown/components/DropdownMenuSeparator';
import { useCloseDropdown } from '@/ui/layout/dropdown/hooks/useCloseDropdown';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { IconMessage, IconPlus } from 'twenty-ui/display';
import { Button } from 'twenty-ui/input';
import { MenuItem } from 'twenty-ui/navigation';

type Props = {
  reviewItemId: string;
  onAddComment: () => void;
};

const getCommentExcerpt = (task: Task): string => {
  const blocks = task.bodyV2?.blocknote
    ? (parseInitialBlocknote(task.bodyV2.blocknote) ?? null)
    : null;
  return getFirstNonEmptyLineOfRichText(blocks);
};

export const ReviewItemCommentsButton = ({
  reviewItemId,
  onAddComment,
}: Props) => {
  const dropdownId = `review-comments-${reviewItemId}`;
  const { tasks } = useTasks({
    targetableObjects: [
      { id: reviewItemId, targetObjectNameSingular: 'reviewItem' },
    ],
  });
  const { closeDropdown } = useCloseDropdown();
  const { openRecordInSidePanel } = useOpenRecordInSidePanel();

  const count = tasks.length;
  const buttonTitle = count > 0 ? `Comments (${count})` : 'Leave comment';

  return (
    <Dropdown
      dropdownId={dropdownId}
      dropdownPlacement="top-end"
      clickableComponent={
        <Button
          title={buttonTitle}
          variant="tertiary"
          accent="default"
          size="small"
          Icon={IconMessage}
        />
      }
      dropdownComponents={
        <DropdownMenuItemsContainer>
          {tasks.map((task) => {
            const excerpt = getCommentExcerpt(task);
            const text = task.title?.trim() || excerpt || 'Untitled';
            return (
              <MenuItem
                key={task.id}
                text={text}
                contextualText={
                  task.title?.trim() && excerpt ? excerpt : undefined
                }
                onClick={() => {
                  closeDropdown(dropdownId);
                  openRecordInSidePanel({
                    recordId: task.id,
                    objectNameSingular: CoreObjectNameSingular.Task,
                  });
                }}
              />
            );
          })}
          {tasks.length > 0 && <DropdownMenuSeparator />}
          <MenuItem
            text="Add comment"
            LeftIcon={IconPlus}
            onClick={() => {
              closeDropdown(dropdownId);
              onAddComment();
            }}
          />
        </DropdownMenuItemsContainer>
      }
    />
  );
};
